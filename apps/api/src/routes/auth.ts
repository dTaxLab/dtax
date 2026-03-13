/**
 * 认证路由
 * POST /auth/register    — 注册账号
 * POST /auth/login       — 登录获取 JWT
 * POST /auth/login/2fa   — 2FA 验证步骤完成登录
 * GET  /auth/me          — 获取当前用户信息
 */

import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { sendEmail, verificationEmail, resetPasswordEmail } from "../lib/email";
import { verifyTotpToken } from "../lib/totp";
import { logAudit } from "../lib/audit.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register（速率限制：每分钟 5 次）
  app.post(
    "/auth/register",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Register a new account",
        body: {
          type: "object" as const,
          required: ["email", "password"],
          properties: {
            email: { type: "string" as const, description: "Email address" },
            password: {
              type: "string" as const,
              description: "Min 8 characters",
            },
            name: { type: "string" as const },
          },
        },
        response: {
          201: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  token: { type: "string" as const },
                  user: {
                    type: "object" as const,
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" as const },
                      email: { type: "string" as const },
                      name: { type: "string" as const },
                      role: { type: "string" as const },
                    },
                  },
                },
              },
            },
          },
          409: {
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
      const body = registerSchema.parse(request.body);

      const existing = await prisma.user.findUnique({
        where: { email: body.email },
      });
      if (existing) {
        return reply.status(409).send({
          error: { code: "EMAIL_EXISTS", message: "Email already registered" },
        });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await prisma.user.create({
        data: { email: body.email, passwordHash, name: body.name },
      });

      const token = app.jwt.sign({ sub: user.id, role: user.role });

      // 发送验证邮件（异步不阻塞响应）
      const verifyJwt = app.jwt.sign(
        { sub: user.id, role: user.role, purpose: "email-verify" } as any,
        { expiresIn: "24h" },
      );
      const verifyUrl = `${config.appUrl}/auth/verify?token=${verifyJwt}`;
      const vEmail = verificationEmail(verifyUrl);
      sendEmail({ to: user.email, ...vEmail }).catch((err) =>
        request.log.error(err, "Failed to send verification email"),
      );

      return reply.status(201).send({
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      });
    },
  );

  // POST /auth/login（速率限制：每分钟 10 次）
  app.post(
    "/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Login with email and password",
        body: {
          type: "object" as const,
          required: ["email", "password"],
          properties: {
            email: { type: "string" as const, description: "Email address" },
            password: { type: "string" as const },
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
                  token: { type: "string" as const },
                  user: {
                    type: "object" as const,
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" as const },
                      email: { type: "string" as const },
                      name: { type: "string" as const },
                      role: { type: "string" as const },
                    },
                  },
                },
              },
            },
          },
          401: {
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
      const body = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });
      if (!user) {
        return reply.status(401).send({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        });
      }

      const valid = await bcrypt.compare(body.password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        });
      }

      // If 2FA is enabled, return a short-lived temp token instead
      if (user.totpEnabled) {
        const tempToken = app.jwt.sign(
          { sub: user.id, purpose: "2fa" } as any,
          { expiresIn: "5m" },
        );
        return { data: { requiresTwoFactor: true, tempToken } };
      }

      const token = app.jwt.sign({ sub: user.id, role: user.role });

      logAudit({
        userId: user.id,
        action: "LOGIN",
        entityType: "auth",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      return {
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      };
    },
  );

  // POST /auth/login/2fa — 2FA 验证完成登录（公共路由，使用 tempToken）
  app.post(
    "/auth/login/2fa",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Complete login with 2FA verification",
        body: {
          type: "object" as const,
          required: ["tempToken"],
          properties: {
            tempToken: {
              type: "string" as const,
              description: "Short-lived JWT from login",
            },
            totpToken: {
              type: "string" as const,
              description: "6-digit TOTP token",
            },
            recoveryCode: {
              type: "string" as const,
              description: "Recovery code",
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
                  token: { type: "string" as const },
                  user: {
                    type: "object" as const,
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" as const },
                      email: { type: "string" as const },
                      name: { type: "string" as const },
                      role: { type: "string" as const },
                    },
                  },
                },
              },
            },
          },
          401: {
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
      const body = z
        .object({
          tempToken: z.string(),
          totpToken: z.string().optional(),
          recoveryCode: z.string().optional(),
        })
        .parse(request.body);

      // Verify the temp token
      let decoded: { sub: string; purpose?: string };
      try {
        decoded = app.jwt.verify(body.tempToken) as {
          sub: string;
          purpose?: string;
        };
      } catch {
        return reply.status(401).send({
          error: {
            code: "INVALID_TOKEN",
            message: "Temp token expired or invalid",
          },
        });
      }

      if (decoded.purpose !== "2fa") {
        return reply.status(401).send({
          error: { code: "INVALID_TOKEN", message: "Invalid token purpose" },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || !user.totpEnabled || !user.totpSecret) {
        return reply.status(401).send({
          error: { code: "UNAUTHORIZED", message: "2FA not configured" },
        });
      }

      let verified = false;

      // Verify TOTP token
      if (body.totpToken) {
        verified = verifyTotpToken(user.totpSecret, body.totpToken);
      }

      // Verify recovery code
      if (!verified && body.recoveryCode) {
        const idx = user.recoveryCodes.indexOf(body.recoveryCode);
        if (idx >= 0) {
          verified = true;
          // Remove used recovery code (one-time use)
          const updatedCodes = [...user.recoveryCodes];
          updatedCodes.splice(idx, 1);
          await prisma.user.update({
            where: { id: user.id },
            data: { recoveryCodes: updatedCodes },
          });
        }
      }

      if (!verified) {
        return reply.status(401).send({
          error: {
            code: "INVALID_2FA",
            message: "Invalid 2FA token or recovery code",
          },
        });
      }

      const token = app.jwt.sign({ sub: user.id, role: user.role });

      logAudit({
        userId: user.id,
        action: "LOGIN",
        entityType: "auth",
        details: { method: "2fa" },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      return {
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      };
    },
  );

  // POST /auth/refresh — 刷新 token（需要有效的现有 token）
  app.post(
    "/auth/refresh",
    {
      schema: {
        tags: ["auth"],
        summary: "Refresh JWT token",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                properties: { token: { type: "string" as const } },
              },
            },
          },
          401: {
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
      // request.userId is set by the auth plugin (token was valid)
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { id: true, role: true },
      });

      if (!user) {
        return reply.status(401).send({
          error: { code: "UNAUTHORIZED", message: "User not found" },
        });
      }

      const token = app.jwt.sign({ sub: user.id, role: user.role });
      return { data: { token } };
    },
  );

  // GET /auth/verify-email — 验证邮箱（公共路由）
  app.get(
    "/auth/verify-email",
    {
      schema: {
        tags: ["auth"],
        summary: "Verify email address via token",
        querystring: {
          type: "object" as const,
          required: ["token"],
          properties: { token: { type: "string" as const } },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                properties: { verified: { type: "boolean" as const } },
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
      const query = z.object({ token: z.string() }).parse(request.query);

      try {
        const decoded = app.jwt.verify(query.token) as {
          sub: string;
          purpose: string;
        };
        if (decoded.purpose !== "email-verify") {
          return reply.status(400).send({
            error: {
              code: "INVALID_TOKEN",
              message: "Invalid verification token",
            },
          });
        }

        await prisma.user.update({
          where: { id: decoded.sub },
          data: { emailVerified: true },
        });

        return { data: { verified: true } };
      } catch {
        return reply.status(400).send({
          error: {
            code: "INVALID_TOKEN",
            message: "Token expired or invalid",
          },
        });
      }
    },
  );

  // POST /auth/forgot-password — 请求密码重置（速率限制：每分钟 3 次）
  app.post(
    "/auth/forgot-password",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Request password reset email",
        body: {
          type: "object" as const,
          required: ["email"],
          properties: {
            email: { type: "string" as const, description: "Email address" },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                properties: { message: { type: "string" as const } },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { email } = z
        .object({ email: z.string().email() })
        .parse(request.body);

      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        await prisma.passwordReset.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        });

        const resetUrl = `${config.appUrl}/auth/reset?token=${token}`;
        const mail = resetPasswordEmail(resetUrl);
        sendEmail({ to: email, ...mail }).catch((err) =>
          request.log.error(err, "Failed to send reset email"),
        );
      }

      // 无论邮箱是否存在都返回成功（防止邮箱枚举攻击）
      return {
        data: {
          message: "If this email exists, a reset link has been sent.",
        },
      };
    },
  );

  // POST /auth/reset-password — 重置密码
  app.post(
    "/auth/reset-password",
    {
      schema: {
        tags: ["auth"],
        summary: "Reset password with token",
        body: {
          type: "object" as const,
          required: ["token", "password"],
          properties: {
            token: { type: "string" as const },
            password: {
              type: "string" as const,
              description: "Min 8 characters",
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
                properties: { message: { type: "string" as const } },
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
      const body = z
        .object({
          token: z.string(),
          password: z.string().min(8),
        })
        .parse(request.body);

      const reset = await prisma.passwordReset.findUnique({
        where: { token: body.token },
      });

      if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
        return reply.status(400).send({
          error: {
            code: "INVALID_TOKEN",
            message: "Token expired or already used",
          },
        });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);

      await Promise.all([
        prisma.user.update({
          where: { id: reset.userId },
          data: { passwordHash },
        }),
        prisma.passwordReset.update({
          where: { id: reset.id },
          data: { usedAt: new Date() },
        }),
      ]);

      return { data: { message: "Password reset successful" } };
    },
  );

  // GET /auth/me — 需要认证
  app.get(
    "/auth/me",
    {
      schema: {
        tags: ["auth"],
        summary: "Get current user profile",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  id: { type: "string" as const },
                  email: { type: "string" as const },
                  name: { type: "string" as const },
                  role: { type: "string" as const },
                  createdAt: { type: "string" as const },
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
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "User not found" },
        });
      }

      return { data: user };
    },
  );
}
