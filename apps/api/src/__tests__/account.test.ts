/**
 * Account 路由测试
 * 测试 GDPR 数据导出、账号删除、取消删除端点
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";

// 模拟 Prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// 模拟 config
vi.mock("../config", () => ({
  config: {
    jwtSecret: "test-secret",
  },
}));

// 模拟 bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

// 模拟 data-export
vi.mock("../lib/data-export", () => ({
  generateUserDataExport: vi.fn(),
}));

// 模拟 account-deletion
vi.mock("../lib/account-deletion", () => ({
  requestAccountDeletion: vi.fn().mockResolvedValue(undefined),
  cancelAccountDeletion: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { generateUserDataExport } from "../lib/data-export";
import {
  requestAccountDeletion,
  cancelAccountDeletion,
} from "../lib/account-deletion";
import { accountRoutes } from "../routes/account";

const mockPrisma = vi.mocked(prisma);
const mockBcrypt = vi.mocked(bcrypt);
const mockExport = vi.mocked(generateUserDataExport);
const mockRequestDeletion = vi.mocked(requestAccountDeletion);
const mockCancelDeletion = vi.mocked(cancelAccountDeletion);

function buildAccountApp() {
  const app = Fastify({ logger: false });

  app.register(jwt, { secret: "test-secret", sign: { expiresIn: "7d" } });

  // 模拟 auth 装饰器
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (request) => {
    request.userId = "user-1";
    request.userRole = "USER";
  });

  // 全局错误处理
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, _request, reply) => {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
          },
        });
      }
      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    },
  );

  app.register(accountRoutes, { prefix: "/api/v1" });

  return app;
}

describe("Account Routes", () => {
  let app: ReturnType<typeof buildAccountApp>;

  beforeAll(async () => {
    app = buildAccountApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/account/export", () => {
    it("should return 200 with exported JSON data", async () => {
      const exportData = {
        exportedAt: "2026-03-12T00:00:00.000Z",
        metadata: {
          transactionCount: 5,
          taxReportCount: 1,
          dataSourceCount: 2,
        },
        user: { id: "user-1", email: "test@example.com" },
        transactions: [],
        taxLots: [],
        taxReports: [],
        dataSources: [],
        subscription: null,
        chatConversations: [],
      };

      mockExport.mockResolvedValueOnce(exportData as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/export",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toBeDefined();
      expect(body.data.exportedAt).toBe("2026-03-12T00:00:00.000Z");
      expect(body.data.metadata.transactionCount).toBe(5);
      expect(mockExport).toHaveBeenCalledWith("user-1");
    });
  });

  describe("POST /api/v1/account/delete", () => {
    it("should reject without password (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/delete",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it("should reject with wrong password (401)", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        passwordHash: "$2a$12$hashedpassword",
      } as any);

      mockBcrypt.compare.mockResolvedValueOnce(false as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/delete",
        payload: { password: "wrongpassword" },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("INVALID_PASSWORD");
    });

    it("should accept with correct password and return deletionScheduledAt", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        passwordHash: "$2a$12$hashedpassword",
      } as any);

      mockBcrypt.compare.mockResolvedValueOnce(true as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/delete",
        payload: { password: "correctpassword", reason: "Testing" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.deletionScheduledAt).toBeDefined();
      expect(mockRequestDeletion).toHaveBeenCalledWith("user-1", "Testing");
    });
  });

  describe("POST /api/v1/account/cancel-deletion", () => {
    it("should cancel pending deletion", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/cancel-deletion",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.cancelled).toBe(true);
      expect(mockCancelDeletion).toHaveBeenCalledWith("user-1");
    });
  });
});
