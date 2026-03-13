/**
 * Two-Factor Authentication routes.
 *
 * POST /auth/2fa/setup    — Generate TOTP secret and QR code (authenticated)
 * POST /auth/2fa/verify   — Verify TOTP token and enable 2FA (authenticated)
 * POST /auth/2fa/disable  — Disable 2FA with valid TOTP token (authenticated)
 * GET  /auth/2fa/status   — Get 2FA enabled status (authenticated)
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import {
  generateTotpSecret,
  verifyTotpToken,
  generateRecoveryCodes,
} from "../lib/totp";

const tokenSchema = z.object({
  token: z.string().min(6).max(6),
});

export async function twoFactorRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/2fa/setup — Generate TOTP secret and QR code
  app.post(
    "/auth/2fa/setup",
    {
      schema: {
        tags: ["auth"],
        summary: "Generate TOTP secret and QR code for 2FA setup",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  qrCodeUrl: { type: "string" as const },
                  secret: { type: "string" as const },
                },
              },
            },
          },
          400: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { email: true, totpEnabled: true },
      });

      if (!user) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "User not found" },
        });
      }

      if (user.totpEnabled) {
        return reply.status(400).send({
          error: {
            code: "ALREADY_ENABLED",
            message: "2FA is already enabled",
          },
        });
      }

      const { secret, uri } = generateTotpSecret(user.email);
      const qrCodeUrl = await QRCode.toDataURL(uri);

      // Store secret temporarily (not enabled until verified)
      await prisma.user.update({
        where: { id: request.userId },
        data: { totpSecret: secret },
      });

      return { data: { qrCodeUrl, secret } };
    },
  );

  // POST /auth/2fa/verify — Verify TOTP token and enable 2FA
  app.post(
    "/auth/2fa/verify",
    {
      schema: {
        tags: ["auth"],
        summary: "Verify TOTP token to enable 2FA",
        body: {
          type: "object" as const,
          required: ["token"],
          properties: {
            token: {
              type: "string" as const,
              description: "6-digit TOTP token",
            },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  enabled: { type: "boolean" as const },
                  recoveryCodes: {
                    type: "array" as const,
                    items: { type: "string" as const },
                  },
                },
              },
            },
          },
          400: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = tokenSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { totpSecret: true, totpEnabled: true },
      });

      if (!user || !user.totpSecret) {
        return reply.status(400).send({
          error: {
            code: "NO_SECRET",
            message: "Run /auth/2fa/setup first",
          },
        });
      }

      if (user.totpEnabled) {
        return reply.status(400).send({
          error: {
            code: "ALREADY_ENABLED",
            message: "2FA is already enabled",
          },
        });
      }

      const valid = verifyTotpToken(user.totpSecret, body.token);
      if (!valid) {
        return reply.status(400).send({
          error: { code: "INVALID_TOKEN", message: "Invalid TOTP token" },
        });
      }

      const recoveryCodes = generateRecoveryCodes();

      await prisma.user.update({
        where: { id: request.userId },
        data: {
          totpEnabled: true,
          totpVerifiedAt: new Date(),
          recoveryCodes,
        },
      });

      return { data: { enabled: true, recoveryCodes } };
    },
  );

  // POST /auth/2fa/disable — Disable 2FA with valid TOTP token
  app.post(
    "/auth/2fa/disable",
    {
      schema: {
        tags: ["auth"],
        summary: "Disable 2FA with a valid TOTP token",
        body: {
          type: "object" as const,
          required: ["token"],
          properties: {
            token: {
              type: "string" as const,
              description: "6-digit TOTP token",
            },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  disabled: { type: "boolean" as const },
                },
              },
            },
          },
          400: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = tokenSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { totpSecret: true, totpEnabled: true },
      });

      if (!user || !user.totpEnabled || !user.totpSecret) {
        return reply.status(400).send({
          error: {
            code: "NOT_ENABLED",
            message: "2FA is not enabled",
          },
        });
      }

      const valid = verifyTotpToken(user.totpSecret, body.token);
      if (!valid) {
        return reply.status(400).send({
          error: { code: "INVALID_TOKEN", message: "Invalid TOTP token" },
        });
      }

      await prisma.user.update({
        where: { id: request.userId },
        data: {
          totpSecret: null,
          totpEnabled: false,
          recoveryCodes: [],
          totpVerifiedAt: null,
        },
      });

      return { data: { disabled: true } };
    },
  );

  // GET /auth/2fa/status — Get 2FA enabled status
  app.get(
    "/auth/2fa/status",
    {
      schema: {
        tags: ["auth"],
        summary: "Get current 2FA status",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  enabled: { type: "boolean" as const },
                },
              },
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { totpEnabled: true },
      });

      if (!user) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "User not found" },
        });
      }

      return { data: { enabled: user.totpEnabled } };
    },
  );
}
