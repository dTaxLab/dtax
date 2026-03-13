/**
 * Client Management Routes Tests
 *
 * Tests CPA multi-client management endpoints: invite, list, get, accept, revoke, update.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "./test-helpers";

// ─── Mock Prisma ────────────────────────────────

const mockPrisma = {
  client: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
  },
};

vi.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Constants ──────────────────────────────────

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── Tests ──────────────────────────────────────

describe("Client Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { clientRoutes } = await import("../routes/clients");
    await app.register(clientRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /clients/invite ───────────────────────

  describe("POST /clients/invite", () => {
    it("should create a pending client invitation", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.create.mockResolvedValueOnce({
        id: "client-1",
        inviteToken: "tok-123",
        status: "PENDING",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/invite",
        payload: { email: "client@example.com", name: "Test Client" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.status).toBe("PENDING");
      expect(body.data.inviteToken).toBe("tok-123");
      expect(body.data.id).toBe("client-1");
    });

    it("should reject non-CPA users", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "FREE",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/invite",
        payload: { email: "client@example.com" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    });

    it("should reject users with no subscription", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/invite",
        payload: { email: "client@example.com" },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ─── GET /clients ───────────────────────────────

  describe("GET /clients", () => {
    it("should list CPA's clients", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findMany.mockResolvedValueOnce([
        { id: "c1", email: "a@b.com", status: "ACTIVE" },
        { id: "c2", email: "c@d.com", status: "PENDING" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/clients",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(2);
    });

    it("should reject non-CPA users", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "PRO",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/clients",
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ─── GET /clients/:id ──────────────────────────

  describe("GET /clients/:id", () => {
    it("should return client details", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: "client-1",
        email: "client@example.com",
        name: "Test Client",
        cpaUserId: TEST_USER_ID,
        status: "ACTIVE",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/clients/client-1",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.id).toBe("client-1");
    });

    it("should return 404 for non-existent client", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/clients/nonexistent",
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });
  });

  // ─── POST /clients/accept ─────────────────────

  describe("POST /clients/accept", () => {
    it("should accept invite and activate client", async () => {
      mockPrisma.client.findUnique.mockResolvedValueOnce({
        id: "client-1",
        status: "PENDING",
        inviteExpiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.client.update.mockResolvedValueOnce({
        id: "client-1",
        status: "ACTIVE",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/accept",
        payload: { inviteToken: "valid-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("ACTIVE");
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: "client-1" },
        data: {
          userId: TEST_USER_ID,
          status: "ACTIVE",
          inviteToken: null,
          inviteExpiresAt: null,
        },
      });
    });

    it("should reject expired invite", async () => {
      mockPrisma.client.findUnique.mockResolvedValueOnce({
        id: "client-1",
        status: "PENDING",
        inviteExpiresAt: new Date(Date.now() - 86400000),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/accept",
        payload: { inviteToken: "expired-token" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("EXPIRED");
    });

    it("should reject invalid invite token", async () => {
      mockPrisma.client.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/accept",
        payload: { inviteToken: "nonexistent-token" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });

    it("should reject already accepted invite", async () => {
      mockPrisma.client.findUnique.mockResolvedValueOnce({
        id: "client-1",
        status: "ACTIVE",
        inviteExpiresAt: new Date(Date.now() + 86400000),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/accept",
        payload: { inviteToken: "used-token" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_STATE");
    });
  });

  // ─── DELETE /clients/:id ──────────────────────

  describe("DELETE /clients/:id", () => {
    it("should revoke client access", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: "client-1",
        cpaUserId: TEST_USER_ID,
      });
      mockPrisma.client.update.mockResolvedValueOnce({
        id: "client-1",
        status: "REVOKED",
      });

      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/clients/client-1",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.success).toBe(true);
    });

    it("should return 404 for non-existent client", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/clients/nonexistent",
      });

      expect(res.statusCode).toBe(404);
    });

    it("should reject non-CPA users", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "FREE",
      });

      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/clients/client-1",
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ─── PUT /clients/:id ────────────────────────

  describe("PUT /clients/:id", () => {
    it("should update client notes", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: "client-1",
        cpaUserId: TEST_USER_ID,
      });
      mockPrisma.client.update.mockResolvedValueOnce({
        id: "client-1",
        notes: "VIP client",
        name: "Test Client",
      });

      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/clients/client-1",
        payload: { notes: "VIP client" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.notes).toBe("VIP client");
    });

    it("should update client name", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: "client-1",
        cpaUserId: TEST_USER_ID,
      });
      mockPrisma.client.update.mockResolvedValueOnce({
        id: "client-1",
        name: "New Name",
      });

      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/clients/client-1",
        payload: { name: "New Name" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe("New Name");
    });

    it("should return 404 for non-existent client", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "CPA",
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/clients/nonexistent",
        payload: { notes: "test" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("should reject non-CPA users", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "FREE",
      });

      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/clients/client-1",
        payload: { notes: "test" },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
