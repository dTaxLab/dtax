/**
 * 认证路由
 * POST /auth/register — 注册账号
 * POST /auth/login    — 登录获取 JWT
 * GET  /auth/me       — 获取当前用户信息
 */

import crypto from "crypto";
import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { sendEmail, verificationEmail, resetPasswordEmail } from "../lib/email";
import { errorResponseSchema } from "../schemas/common";
import { userRoleEnum } from "../schemas/enums";

const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
  })
  .openapi({ ref: "RegisterInput" });

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string(),
  })
  .openapi({ ref: "LoginInput" });

const authUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: userRoleEnum,
  })
  .openapi({ ref: "AuthUser" });

const tokenResponseSchema = z
  .object({
    data: z.object({
      token: z.string(),
      user: authUserSchema,
    }),
  })
  .openapi({ ref: "AuthResponse" });

const userProfileSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: userRoleEnum,
    createdAt: z.date(),
  })
  .openapi({ ref: "UserProfile" });

export async function authRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // POST /auth/register（速率限制：每分钟 5 次）
  r.post(
    "/auth/register",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        operationId: "register",
        description: "Register a new user account",
        security: [],
        body: registerSchema,
        response: {
          201: tokenResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

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
  r.post(
    "/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        operationId: "login",
        description: "Login with email and password to get a JWT token",
        security: [],
        body: loginSchema,
        response: {
          200: tokenResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

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

      const token = app.jwt.sign({ sub: user.id, role: user.role });

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
  r.post(
    "/auth/refresh",
    {
      schema: {
        tags: ["auth"],
        operationId: "refreshToken",
        description: "Refresh JWT token (requires valid existing token)",
        response: {
          200: z.object({ data: z.object({ token: z.string() }) }),
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
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
  r.get(
    "/auth/verify-email",
    {
      schema: {
        tags: ["auth"],
        operationId: "verifyEmail",
        description: "Verify email address using the token sent via email",
        security: [],
        querystring: z.object({ token: z.string() }),
        response: {
          200: z.object({ data: z.object({ verified: z.boolean() }) }),
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const query = request.query;

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
  r.post(
    "/auth/forgot-password",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        operationId: "forgotPassword",
        description: "Request a password reset email",
        security: [],
        body: z.object({ email: z.string().email() }),
        response: {
          200: z.object({ data: z.object({ message: z.string() }) }),
        },
      },
    },
    async (request) => {
      const { email } = request.body;

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
  r.post(
    "/auth/reset-password",
    {
      schema: {
        tags: ["auth"],
        operationId: "resetPassword",
        description: "Reset password using the token from the reset email",
        security: [],
        body: z.object({
          token: z.string(),
          password: z.string().min(8),
        }),
        response: {
          200: z.object({ data: z.object({ message: z.string() }) }),
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

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
  r.get(
    "/auth/me",
    {
      schema: {
        tags: ["auth"],
        operationId: "getMe",
        description: "Get current authenticated user profile",
        response: {
          200: z.object({
            data: userProfileSchema,
          }),
          404: errorResponseSchema,
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
