import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    transaction: { deleteMany: vi.fn() },
    taxLot: { deleteMany: vi.fn() },
    taxReport: { deleteMany: vi.fn() },
    dataSource: { deleteMany: vi.fn() },
    subscription: { deleteMany: vi.fn() },
    passwordReset: { deleteMany: vi.fn() },
    chatMessage: { deleteMany: vi.fn() },
    chatConversation: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  requestAccountDeletion,
  cancelAccountDeletion,
  executeAccountDeletion,
  cleanupDeletedAccounts,
} from "../lib/account-deletion.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("Account Deletion Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({} as any);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" } as any);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      if (Array.isArray(fn)) return fn;
      return fn(mockPrisma);
    });
  });

  describe("requestAccountDeletion", () => {
    it("should set deletionRequestedAt on user", async () => {
      await requestAccountDeletion("user-1", "No longer needed");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: expect.objectContaining({
          deletionRequestedAt: expect.any(Date),
          deletionReason: "No longer needed",
        }),
      });
    });

    it("should work without reason", async () => {
      await requestAccountDeletion("user-1");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: expect.objectContaining({
          deletionRequestedAt: expect.any(Date),
        }),
      });
    });
  });

  describe("cancelAccountDeletion", () => {
    it("should clear deletionRequestedAt and reason", async () => {
      await cancelAccountDeletion("user-1");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          deletionRequestedAt: null,
          deletionReason: null,
        },
      });
    });
  });

  describe("executeAccountDeletion", () => {
    it("should delete all user data in a transaction", async () => {
      await executeAccountDeletion("user-1");
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("cleanupDeletedAccounts", () => {
    it("should find and delete accounts past 30-day window", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "old-user-1" },
        { id: "old-user-2" },
      ] as any);
      const count = await cleanupDeletedAccounts();
      expect(count).toBe(2);
    });

    it("should return 0 when no accounts to clean", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const count = await cleanupDeletedAccounts();
      expect(count).toBe(0);
    });
  });
});
