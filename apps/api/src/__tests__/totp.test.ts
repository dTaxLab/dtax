import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  verifyTotpToken,
  generateRecoveryCodes,
} from "../lib/totp.js";

describe("TOTP Service", () => {
  describe("generateTotpSecret", () => {
    it("should generate a secret and otpauth URI", () => {
      const result = generateTotpSecret("user@example.com");
      expect(result.secret).toBeDefined();
      expect(typeof result.secret).toBe("string");
      expect(result.secret.length).toBeGreaterThan(10);
      expect(result.uri).toContain("otpauth://totp/DTax:");
      expect(result.uri).toContain("user%40example.com");
    });

    it("should generate unique secrets each time", () => {
      const a = generateTotpSecret("user@example.com");
      const b = generateTotpSecret("user@example.com");
      expect(a.secret).not.toBe(b.secret);
    });
  });

  describe("verifyTotpToken", () => {
    it("should verify a valid token generated from the secret", () => {
      const { secret } = generateTotpSecret("user@example.com");
      // Generate the current valid token from the same secret
      const OTPAuth = require("otpauth");
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });
      const validToken = totp.generate();
      expect(verifyTotpToken(secret, validToken)).toBe(true);
    });

    it("should reject an invalid token", () => {
      const { secret } = generateTotpSecret("user@example.com");
      expect(verifyTotpToken(secret, "000000")).toBe(false);
    });

    it("should reject empty token", () => {
      const { secret } = generateTotpSecret("user@example.com");
      expect(verifyTotpToken(secret, "")).toBe(false);
    });
  });

  describe("generateRecoveryCodes", () => {
    it("should generate 10 recovery codes by default", () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
    });

    it("should generate codes in xxxx-xxxx-xxxx format", () => {
      const codes = generateRecoveryCodes();
      codes.forEach((code) => {
        expect(code).toMatch(/^[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}$/);
      });
    });

    it("should generate unique codes", () => {
      const codes = generateRecoveryCodes();
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it("should respect custom count", () => {
      const codes = generateRecoveryCodes(5);
      expect(codes).toHaveLength(5);
    });
  });
});
