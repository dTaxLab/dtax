/**
 * Billing route integration tests.
 *
 * Tests billing/status, billing/checkout routes and plan-guard quota logic
 * with mocked Prisma and Stripe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "./test-helpers";

// ─── Mock Prisma ────────────────────────────────

const mockPrisma = {
  subscription: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  transaction: {
    count: vi.fn(),
  },
};

vi.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock Stripe ────────────────────────────────

const mockCheckoutSessionCreate = vi.fn();
const mockCustomersCreate = vi.fn();

vi.mock("stripe", () => {
  return {
    default: class StripeMock {
      checkout = {
        sessions: {
          create: mockCheckoutSessionCreate,
        },
      };
      customers = {
        create: mockCustomersCreate,
      };
      billingPortal = {
        sessions: { create: vi.fn() },
      };
      webhooks = {
        constructEvent: vi.fn(),
      };
    },
  };
});

// ─── Tests ──────────────────────────────────────

describe("Billing Routes", () => {
  let app: ReturnType<typeof import("fastify").default>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { billingRoutes } = await import("../routes/billing");
    await app.register(billingRoutes, { prefix: "/api/v1" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /billing/status", () => {
    it("no subscription returns FREE plan", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/billing/status",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.plan).toBe("FREE");
      expect(body.data.status).toBe("active");
    });

    it("with subscription returns PRO plan", async () => {
      const periodEnd = new Date("2026-01-01T00:00:00Z");
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        plan: "PRO",
        status: "active",
        taxYear: 2025,
        currentPeriodEnd: periodEnd,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/billing/status",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.plan).toBe("PRO");
      expect(body.data.status).toBe("active");
      expect(body.data.taxYear).toBe(2025);
    });
  });

  describe("POST /billing/checkout", () => {
    it("invalid plan returns 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/billing/checkout",
        payload: { plan: "INVALID" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("valid plan returns checkout URL", async () => {
      // Set the env vars so the route doesn't 503 on missing Stripe config
      process.env.STRIPE_SECRET_KEY = "sk_test_fake";
      process.env.STRIPE_PRO_PRICE_ID = "price_test_pro";

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
      });
      mockPrisma.subscription.findUnique.mockResolvedValueOnce({
        userId: "00000000-0000-0000-0000-000000000001",
        plan: "FREE",
        stripeCustomerId: "cus_test123",
      });
      mockCheckoutSessionCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/session/test",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/billing/checkout",
        payload: { plan: "PRO", taxYear: 2025 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.url).toBe("https://checkout.stripe.com/session/test");
      expect(mockCheckoutSessionCreate).toHaveBeenCalledOnce();

      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_PRO_PRICE_ID;
    });
  });
});

describe("Plan Guard — checkTransactionQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("FREE user at 50 transactions is rejected", async () => {
    mockPrisma.subscription.findUnique.mockResolvedValueOnce(null);
    mockPrisma.transaction.count.mockResolvedValueOnce(50);

    const { checkTransactionQuota } = await import("../plugins/plan-guard");
    const result = await checkTransactionQuota(
      "00000000-0000-0000-0000-000000000001",
    );

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(50);
    expect(result.plan).toBe("FREE");
    expect(result.current).toBe(50);
  });

  it("PRO user has unlimited access", async () => {
    mockPrisma.subscription.findUnique.mockResolvedValueOnce({
      plan: "PRO",
      status: "active",
    });

    const { checkTransactionQuota } = await import("../plugins/plan-guard");
    const result = await checkTransactionQuota(
      "00000000-0000-0000-0000-000000000001",
    );

    expect(result.allowed).toBe(true);
    expect(result.plan).toBe("PRO");
  });
});
