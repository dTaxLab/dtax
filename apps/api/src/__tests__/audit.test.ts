import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { logAudit, getAuditLogs } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

const mockAuditLog = prisma.auditLog as any;

describe("Audit Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logAudit", () => {
    it("should create an audit log entry", async () => {
      mockAuditLog.create.mockResolvedValue({
        id: "log-1",
        userId: "user-1",
        action: "CREATE",
        entityType: "transaction",
        entityId: "tx-123",
      });

      const entry = await logAudit({
        userId: "user-1",
        action: "CREATE",
        entityType: "transaction",
        entityId: "tx-123",
        details: { type: "BUY", asset: "BTC" },
        ipAddress: "127.0.0.1",
      });

      expect(entry.id).toBe("log-1");
      expect(entry.action).toBe("CREATE");
      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          action: "CREATE",
          entityType: "transaction",
          entityId: "tx-123",
        }),
      });
    });

    it("should handle optional fields", async () => {
      mockAuditLog.create.mockResolvedValue({ id: "log-2", action: "LOGIN" });

      await logAudit({
        userId: "user-1",
        action: "LOGIN",
        entityType: "auth",
      });

      expect(mockAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityId: null,
          details: null,
          ipAddress: null,
          userAgent: null,
        }),
      });
    });
  });

  describe("getAuditLogs", () => {
    it("should query logs with filters", async () => {
      mockAuditLog.findMany.mockResolvedValue([{ id: "log-1" }]);
      mockAuditLog.count.mockResolvedValue(1);

      const result = await getAuditLogs("user-1", {
        action: "CREATE",
        entityType: "transaction",
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            action: "CREATE",
            entityType: "transaction",
          },
          take: 10,
        }),
      );
    });

    it("should support date range filtering", async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      const from = new Date("2024-01-01");
      const to = new Date("2024-12-31");

      await getAuditLogs("user-1", { from, to });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it("should use default pagination", async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await getAuditLogs("user-1");

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        }),
      );
    });
  });
});
