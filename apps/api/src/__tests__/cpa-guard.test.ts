/**
 * CPA Guard 测试
 * 测试 CPA 计划访问检查和客户端访问验证
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
    },
  },
}));

import { checkCpaAccess, verifyCpaClientAccess } from "../plugins/cpa-guard.js";
import { prisma } from "../lib/prisma.js";

const mockSubscription = prisma.subscription as any;
const mockClient = prisma.client as any;

describe("CPA Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCpaAccess", () => {
    it("should reject user with no subscription", async () => {
      mockSubscription.findUnique.mockResolvedValue(null);
      const result = await checkCpaAccess("user-1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("CPA_PLAN_REQUIRED");
    });

    it("should reject FREE plan user", async () => {
      mockSubscription.findUnique.mockResolvedValue({ plan: "FREE" });
      const result = await checkCpaAccess("user-1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("CPA_PLAN_REQUIRED");
    });

    it("should reject PRO plan user", async () => {
      mockSubscription.findUnique.mockResolvedValue({ plan: "PRO" });
      const result = await checkCpaAccess("user-1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("CPA_PLAN_REQUIRED");
    });

    it("should allow CPA plan user", async () => {
      mockSubscription.findUnique.mockResolvedValue({ plan: "CPA" });
      const result = await checkCpaAccess("user-cpa");
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("verifyCpaClientAccess", () => {
    it("should allow CPA to access their own active client", async () => {
      mockClient.findFirst.mockResolvedValue({
        id: "client-1",
        cpaUserId: "cpa-1",
        userId: "user-2",
        status: "ACTIVE",
      });
      const result = await verifyCpaClientAccess("cpa-1", "client-1");
      expect(result.allowed).toBe(true);
      expect(result.clientUserId).toBe("user-2");
    });

    it("should reject access to non-existent client", async () => {
      mockClient.findFirst.mockResolvedValue(null);
      const result = await verifyCpaClientAccess("cpa-1", "nonexistent");
      expect(result.allowed).toBe(false);
      expect(result.clientUserId).toBeUndefined();
    });

    it("should reject access to client without linked user", async () => {
      mockClient.findFirst.mockResolvedValue({
        id: "client-1",
        cpaUserId: "cpa-1",
        userId: null,
        status: "ACTIVE",
      });
      const result = await verifyCpaClientAccess("cpa-1", "client-1");
      expect(result.allowed).toBe(false);
      expect(result.clientUserId).toBeUndefined();
    });
  });
});
