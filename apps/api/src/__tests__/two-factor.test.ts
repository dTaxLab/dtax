/**
 * Two-Factor Authentication API Tests
 *
 * Tests 2FA management routes and the modified login flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "./test-helpers";

// ─── Mock Prisma ────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock TOTP service ──────────────────────────

vi.mock("../lib/totp", () => ({
  generateTotpSecret: vi.fn().mockReturnValue({
    secret: "JBSWY3DPEHPK3PXP",
    uri: "otpauth://totp/DTax:test@test.com?secret=JBSWY3DPEHPK3PXP&issuer=DTax",
  }),
  verifyTotpToken: vi.fn().mockReturnValue(true),
  generateRecoveryCodes: vi
    .fn()
    .mockReturnValue(["aaaa-bbbb-cccc", "dddd-eeee-ffff", "1111-2222-3333"]),
}));

// ─── Mock QRCode ────────────────────────────────

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,FAKEQRCODE"),
  },
}));

// ─── Import mocked modules for assertions ───────

const { verifyTotpToken } = await import("../lib/totp");

// ─── Helpers ────────────────────────────────────

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_USER_ID,
    email: "test@test.com",
    name: "Test User",
    role: "USER",
    passwordHash: "$2a$12$fakehash",
    totpSecret: null,
    totpEnabled: false,
    recoveryCodes: [],
    totpVerifiedAt: null,
    ...overrides,
  };
}

// ─── 2FA Management Routes ──────────────────────

describe("Two-Factor Management Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { twoFactorRoutes } = await import("../routes/two-factor");
    await app.register(twoFactorRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /auth/2fa/setup ─────────────────────

  describe("POST /auth/2fa/setup", () => {
    it("returns QR code URL and secret", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({ totpEnabled: false }),
      );
      mockPrisma.user.update.mockResolvedValueOnce(mockUser());

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/2fa/setup",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.qrCodeUrl).toContain("data:image/png;base64");
      expect(body.data.secret).toBe("JBSWY3DPEHPK3PXP");
    });

    it("rejects if 2FA is already enabled", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({ totpEnabled: true }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/2fa/setup",
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("ALREADY_ENABLED");
    });
  });

  // ─── POST /auth/2fa/verify ────────────────────

  describe("POST /auth/2fa/verify", () => {
    it("enables 2FA and returns recovery codes", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({ totpSecret: "JBSWY3DPEHPK3PXP", totpEnabled: false }),
      );
      mockPrisma.user.update.mockResolvedValueOnce(
        mockUser({ totpEnabled: true }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/2fa/verify",
        payload: { token: "123456" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.enabled).toBe(true);
      expect(body.data.recoveryCodes).toHaveLength(3);
      expect(body.data.recoveryCodes[0]).toBe("aaaa-bbbb-cccc");
    });

    it("rejects invalid TOTP token", async () => {
      vi.mocked(verifyTotpToken).mockReturnValueOnce(false);
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({ totpSecret: "JBSWY3DPEHPK3PXP", totpEnabled: false }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/2fa/verify",
        payload: { token: "000000" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("INVALID_TOKEN");
    });
  });

  // ─── POST /auth/2fa/disable ───────────────────

  describe("POST /auth/2fa/disable", () => {
    it("disables 2FA with valid token", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({
          totpSecret: "JBSWY3DPEHPK3PXP",
          totpEnabled: true,
          recoveryCodes: ["aaaa-bbbb-cccc"],
        }),
      );
      mockPrisma.user.update.mockResolvedValueOnce(
        mockUser({ totpEnabled: false, totpSecret: null }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/2fa/disable",
        payload: { token: "123456" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.disabled).toBe(true);
    });

    it("rejects when 2FA not enabled", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({ totpEnabled: false }),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/2fa/disable",
        payload: { token: "123456" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("NOT_ENABLED");
    });
  });

  // ─── GET /auth/2fa/status ─────────────────────

  describe("GET /auth/2fa/status", () => {
    it("returns enabled status", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({ totpEnabled: true }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/2fa/status",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.enabled).toBe(true);
    });

    it("returns disabled status", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({ totpEnabled: false }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/2fa/status",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.enabled).toBe(false);
    });
  });
});

// ─── Login Flow with 2FA ────────────────────────

describe("Login Flow with 2FA", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();

    // Register JWT for tempToken signing/verification
    const jwt = await import("@fastify/jwt");
    await app.register(jwt.default, {
      secret: "test-secret-for-jwt",
      sign: { expiresIn: "7d" },
    });

    // Remove the default auth hook that buildApp adds (it sets userId automatically)
    // We need the raw app for login tests
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /auth/login with 2FA enabled", () => {
    it("returns requiresTwoFactor and tempToken when 2FA enabled", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password123", 4);

      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({
          passwordHash: hash,
          totpEnabled: true,
          totpSecret: "JBSWY3DPEHPK3PXP",
        }),
      );

      const { authRoutes } = await import("../routes/auth");
      await app.register(authRoutes, { prefix: "/api/v1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "test@test.com", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.requiresTwoFactor).toBe(true);
      expect(body.data.tempToken).toBeDefined();
      expect(body.data.token).toBeUndefined();
    });

    it("returns normal token when 2FA not enabled", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password123", 4);

      mockPrisma.user.findUnique.mockResolvedValueOnce(
        mockUser({
          passwordHash: hash,
          totpEnabled: false,
        }),
      );

      const { authRoutes } = await import("../routes/auth");
      await app.register(authRoutes, { prefix: "/api/v1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "test@test.com", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.token).toBeDefined();
      expect(body.data.requiresTwoFactor).toBeUndefined();
    });
  });

  describe("POST /auth/login/2fa", () => {
    it("returns full token with valid TOTP", async () => {
      const user = mockUser({
        totpEnabled: true,
        totpSecret: "JBSWY3DPEHPK3PXP",
        recoveryCodes: ["aaaa-bbbb-cccc"],
      });

      // First call for login/2fa user lookup
      mockPrisma.user.findUnique.mockResolvedValueOnce(user);

      const { authRoutes } = await import("../routes/auth");
      await app.register(authRoutes, { prefix: "/api/v1" });

      // Create a valid temp token
      const tempToken = app.jwt.sign(
        { sub: TEST_USER_ID, purpose: "2fa" } as any,
        { expiresIn: "5m" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login/2fa",
        payload: { tempToken, totpToken: "123456" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.token).toBeDefined();
      expect(body.data.user.id).toBe(TEST_USER_ID);
      expect(body.data.user.email).toBe("test@test.com");
    });

    it("accepts recovery code", async () => {
      const user = mockUser({
        totpEnabled: true,
        totpSecret: "JBSWY3DPEHPK3PXP",
        recoveryCodes: ["aaaa-bbbb-cccc", "dddd-eeee-ffff"],
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce(user);
      mockPrisma.user.update.mockResolvedValueOnce(
        mockUser({ recoveryCodes: ["dddd-eeee-ffff"] }),
      );

      // verifyTotpToken should NOT be called for recovery code path
      // but we need it to return false when totpToken is not provided
      vi.mocked(verifyTotpToken).mockReturnValueOnce(false);

      const { authRoutes } = await import("../routes/auth");
      await app.register(authRoutes, { prefix: "/api/v1" });

      const tempToken = app.jwt.sign(
        { sub: TEST_USER_ID, purpose: "2fa" } as any,
        { expiresIn: "5m" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login/2fa",
        payload: { tempToken, recoveryCode: "aaaa-bbbb-cccc" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.token).toBeDefined();
      expect(body.data.user.id).toBe(TEST_USER_ID);

      // Verify recovery code was removed
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
        data: { recoveryCodes: ["dddd-eeee-ffff"] },
      });
    });

    it("rejects invalid TOTP token", async () => {
      vi.mocked(verifyTotpToken).mockReturnValueOnce(false);

      const user = mockUser({
        totpEnabled: true,
        totpSecret: "JBSWY3DPEHPK3PXP",
        recoveryCodes: [],
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce(user);

      const { authRoutes } = await import("../routes/auth");
      await app.register(authRoutes, { prefix: "/api/v1" });

      const tempToken = app.jwt.sign(
        { sub: TEST_USER_ID, purpose: "2fa" } as any,
        { expiresIn: "5m" },
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login/2fa",
        payload: { tempToken, totpToken: "000000" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("INVALID_2FA");
    });

    it("rejects expired temp token", async () => {
      const { authRoutes } = await import("../routes/auth");
      await app.register(authRoutes, { prefix: "/api/v1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login/2fa",
        payload: { tempToken: "invalid.jwt.token", totpToken: "123456" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("INVALID_TOKEN");
    });
  });
});
