/**
 * Data Export Service 测试
 * GDPR compliance: 用户数据导出
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn() },
    taxLot: { findMany: vi.fn() },
    taxReport: { findMany: vi.fn() },
    dataSource: { findMany: vi.fn() },
    subscription: { findUnique: vi.fn() },
    chatConversation: { findMany: vi.fn() },
  },
}));

import { generateUserDataExport } from "../lib/data-export.js";
import { prisma } from "../lib/prisma";

const mockPrisma = vi.mocked(prisma);

describe("Data Export Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock returns
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "USER",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockPrisma.transaction.findMany.mockResolvedValue([
      { id: "tx-1", type: "BUY", sentAsset: "USD", receivedAsset: "BTC" },
    ] as any);
    mockPrisma.taxLot.findMany.mockResolvedValue([]);
    mockPrisma.taxReport.findMany.mockResolvedValue([]);
    mockPrisma.dataSource.findMany.mockResolvedValue([]);
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.chatConversation.findMany.mockResolvedValue([]);
  });

  it("should include all user tables in export", async () => {
    const data = await generateUserDataExport("user-1");
    expect(data).toHaveProperty("user");
    expect(data).toHaveProperty("transactions");
    expect(data).toHaveProperty("taxLots");
    expect(data).toHaveProperty("taxReports");
    expect(data).toHaveProperty("dataSources");
    expect(data).toHaveProperty("subscription");
    expect(data).toHaveProperty("chatConversations");
    expect(data).toHaveProperty("exportedAt");
    expect(data).toHaveProperty("metadata");
  });

  it("should exclude sensitive fields from user data", async () => {
    const data = await generateUserDataExport("user-1");
    expect(data.user).not.toHaveProperty("passwordHash");
    expect(data.user).not.toHaveProperty("totpSecret");
    expect(data.user).not.toHaveProperty("recoveryCodes");
  });

  it("should exclude config (encrypted API keys) from data sources", async () => {
    mockPrisma.dataSource.findMany.mockResolvedValue([
      {
        id: "ds-1",
        name: "Binance",
        type: "EXCHANGE_API",
        status: "ACTIVE",
        createdAt: new Date(),
      },
    ] as any);
    const data = await generateUserDataExport("user-1");
    if (data.dataSources.length > 0) {
      expect(data.dataSources[0]).not.toHaveProperty("config");
    }
  });

  it("should include metadata with counts", async () => {
    const data = await generateUserDataExport("user-1");
    expect(data.metadata.transactionCount).toBeDefined();
    expect(data.metadata.taxReportCount).toBeDefined();
    expect(data.metadata.dataSourceCount).toBeDefined();
  });

  it("should call prisma with correct userId", async () => {
    await generateUserDataExport("user-42");
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-42" } }),
    );
    expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-42" } }),
    );
  });

  it("should return correct transaction count in metadata", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      { id: "tx-1" },
      { id: "tx-2" },
      { id: "tx-3" },
    ] as any);
    const data = await generateUserDataExport("user-1");
    expect(data.metadata.transactionCount).toBe(3);
  });

  it("should handle null subscription gracefully", async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    const data = await generateUserDataExport("user-1");
    expect(data.subscription).toBeNull();
  });

  it("should include ISO timestamp in exportedAt", async () => {
    const data = await generateUserDataExport("user-1");
    expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
