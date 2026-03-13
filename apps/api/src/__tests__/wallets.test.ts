import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

vi.mock("../lib/prisma", () => ({
  prisma: {
    dataSource: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../config", () => ({
  config: {
    jwtSecret: "test-secret",
    etherscanApiKey: "test-etherscan-key",
    solscanApiKey: "test-solscan-key",
  },
}));

vi.mock("../lib/blockchain/address-validator.js", () => ({
  isValidAddress: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/notification.js", () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

import { prisma } from "../lib/prisma";
import { isValidAddress } from "../lib/blockchain/address-validator.js";
import { walletRoutes } from "../routes/wallets.js";

const mockPrisma = vi.mocked(prisma);
const mockIsValid = vi.mocked(isValidAddress);

function buildApp() {
  const app = Fastify({ logger: false });

  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (request) => {
    request.userId = "user-1";
    request.userRole = "USER";
  });

  app.setErrorHandler(
    (error: Error & { statusCode?: number }, _request, reply) => {
      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    },
  );

  app.register(walletRoutes, { prefix: "/api/v1" });
  return app;
}

describe("Wallet Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/wallets/connect", () => {
    it("should connect a valid wallet", async () => {
      mockIsValid.mockReturnValue(true);
      mockPrisma.dataSource.findFirst.mockResolvedValueOnce(null);
      mockPrisma.dataSource.create.mockResolvedValueOnce({
        id: "ds-1",
        userId: "user-1",
        type: "BLOCKCHAIN",
        name: "ethereum wallet",
        status: "ACTIVE",
        lastSyncAt: null,
        config: { address: "0xabc", chain: "ethereum" },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets/connect",
        payload: {
          address: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe",
          chain: "ethereum",
          label: "My Wallet",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.dataSourceId).toBe("ds-1");
    });

    it("should reject invalid address", async () => {
      mockIsValid.mockReturnValue(false);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets/connect",
        payload: { address: "invalid", chain: "ethereum" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_ADDRESS");
    });

    it("should reject duplicate wallet", async () => {
      mockIsValid.mockReturnValue(true);
      mockPrisma.dataSource.findFirst.mockResolvedValueOnce({
        id: "existing",
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets/connect",
        payload: {
          address: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe",
          chain: "ethereum",
        },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /api/v1/wallets", () => {
    it("should list connected wallets", async () => {
      mockPrisma.dataSource.findMany.mockResolvedValueOnce([
        {
          id: "ds-1",
          name: "My Wallet",
          config: { address: "0xabc", chain: "ethereum" },
          status: "ACTIVE",
          lastSyncAt: null,
          createdAt: new Date(),
        },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/wallets",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].chain).toBe("ethereum");
    });
  });

  describe("POST /api/v1/wallets/:id/sync", () => {
    it("should trigger sync for existing wallet", async () => {
      mockPrisma.dataSource.findFirst.mockResolvedValueOnce({
        id: "ds-1",
        userId: "user-1",
        type: "BLOCKCHAIN",
      } as any);
      mockPrisma.dataSource.update.mockResolvedValueOnce({} as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets/ds-1/sync",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("sync_triggered");
    });

    it("should return 404 for non-existent wallet", async () => {
      mockPrisma.dataSource.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets/nonexistent/sync",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/wallets/:id", () => {
    it("should disconnect wallet", async () => {
      mockPrisma.dataSource.findFirst.mockResolvedValueOnce({
        id: "ds-1",
        userId: "user-1",
        type: "BLOCKCHAIN",
      } as any);
      mockPrisma.dataSource.update.mockResolvedValueOnce({} as any);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/wallets/ds-1",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.deleted).toBe(true);
    });

    it("should return 404 for non-existent wallet", async () => {
      mockPrisma.dataSource.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/wallets/nonexistent",
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
