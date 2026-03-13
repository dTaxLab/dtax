/**
 * TOTP (Time-based One-Time Password) service for two-factor authentication.
 *
 * Pure functions with no Prisma dependency — handles secret generation,
 * token verification, and recovery code generation.
 */

import * as OTPAuth from "otpauth";
import crypto from "crypto";

/**
 * Generate a new TOTP secret and otpauth URI for a user.
 *
 * Args:
 *     email: The user's email address, used as the TOTP label.
 *
 * Returns:
 *     Object containing the Base32-encoded secret and the otpauth URI
 *     suitable for QR code generation.
 */
export function generateTotpSecret(email: string): {
  secret: string;
  uri: string;
} {
  const totp = new OTPAuth.TOTP({
    issuer: "DTax",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Verify a TOTP token against a stored secret.
 *
 * Args:
 *     secret: The Base32-encoded TOTP secret.
 *     token: The 6-digit token to verify.
 *
 * Returns:
 *     True if the token is valid within a window of +/- 1 period.
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  if (!token) return false;

  const totp = new OTPAuth.TOTP({
    issuer: "DTax",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * Generate a set of single-use recovery codes.
 *
 * Args:
 *     count: Number of recovery codes to generate (default 10).
 *
 * Returns:
 *     Array of recovery codes in xxxx-xxxx-xxxx hex format.
 */
export function generateRecoveryCodes(count: number = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(6);
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
  });
}
