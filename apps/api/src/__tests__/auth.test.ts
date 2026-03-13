/**
 * Auth 路由测试
 * 测试注册、登录、me 端点
 */

import "zod-openapi/extend";

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import { fastifyZodOpenApiPlugin } from "fastify-zod-openapi";
import { hybridValidatorCompiler } from "./test-helpers";
import { authRoutes } from "../routes/auth";

// 模拟 Prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passwordReset: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// 模拟 config
vi.mock("../config", () => ({
  config: {
    jwtSecret: "test-secret",
    appUrl: "http://localhost:3000",
    fromEmail: "noreply@test.com",
    resendApiKey: "",
  },
}));

// 模拟 email 模块
vi.mock("../lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  verificationEmail: vi
    .fn()
    .mockReturnValue({ subject: "Verify", html: "<p>verify</p>" }),
  resetPasswordEmail: vi
    .fn()
    .mockReturnValue({ subject: "Reset", html: "<p>reset</p>" }),
}));

// 模拟 bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
    compare: vi.fn(),
  },
}));

import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

const mockPrisma = vi.mocked(prisma);
const mockBcrypt = vi.mocked(bcrypt);

function buildAuthApp() {
  const app = Fastify({ logger: false });

  app.register(fastifyZodOpenApiPlugin);
  app.setValidatorCompiler(hybridValidatorCompiler);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  // 注册 JWT（auth 路由需要 app.jwt.sign）
  app.register(jwt, { secret: "test-secret", sign: { expiresIn: "7d" } });

  // 模拟 auth 装饰器
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (request) => {
    request.userId = "user-1";
    request.userRole = "USER";
  });

  // 全局错误处理
  app.setErrorHandler((error: Error, _request, reply) => {
    const errAny = error as Error & {
      validation?: unknown[];
      statusCode?: number;
    };
    if (errAny.validation) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: errAny.validation,
        },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
        },
      });
    }
    return reply.status(500).send({ error: { message: error.message } });
  });

  app.register(authRoutes, { prefix: "/api/v1" });
  return app;
}

describe("Auth Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = buildAuthApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /auth/register", () => {
    it("注册新用户成功返回 201 + token", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        passwordHash: "$2a$12$hash",
        name: "Test",
        role: "USER",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "test@example.com",
          password: "password123",
          name: "Test",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.token).toBeDefined();
      expect(body.data.user.email).toBe("test@example.com");
      expect(body.data.user.role).toBe("USER");
    });

    it("邮箱已存在返回 409", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "existing",
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "taken@example.com", password: "password123" },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe("EMAIL_EXISTS");
    });

    it("密码太短返回 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "short@example.com", password: "123" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /auth/login", () => {
    it("凭证正确返回 token", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        passwordHash: "$2a$12$hash",
        name: "Test",
        role: "USER",
      } as any);
      mockBcrypt.compare.mockResolvedValueOnce(true as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "test@example.com", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.token).toBeDefined();
      expect(body.data.user.email).toBe("test@example.com");
    });

    it("邮箱不存在返回 401", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nobody@example.com", password: "password123" },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe("INVALID_CREDENTIALS");
    });

    it("密码错误返回 401", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        passwordHash: "$2a$12$hash",
      } as any);
      mockBcrypt.compare.mockResolvedValueOnce(false as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "test@example.com", password: "wrongpassword" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    it("有效 token 返回用户信息", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        name: "Test",
        role: "USER",
        createdAt: new Date("2026-01-01"),
      } as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.email).toBe("test@example.com");
    });
  });

  describe("GET /auth/verify-email", () => {
    it("有效 token 验证邮箱成功", async () => {
      // 生成真实的 verify JWT
      const verifyToken = app.jwt.sign(
        { sub: "user-1", purpose: "email-verify" },
        { expiresIn: "24h" },
      );
      mockPrisma.user.update.mockResolvedValueOnce({
        id: "user-1",
        emailVerified: true,
      } as any);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/auth/verify-email?token=${verifyToken}`,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.verified).toBe(true);
    });

    it("无效 token 返回 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/verify-email?token=invalid-jwt-token",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("INVALID_TOKEN");
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("已注册邮箱返回 200", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
      } as any);
      (mockPrisma.passwordReset.create as any).mockResolvedValueOnce({} as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/forgot-password",
        payload: { email: "test@example.com" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("未注册邮箱也返回 200（防枚举）", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/forgot-password",
        payload: { email: "nobody@example.com" },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /auth/reset-password", () => {
    it("有效 token 重置密码成功", async () => {
      (mockPrisma.passwordReset.findUnique as any).mockResolvedValueOnce({
        id: "pr-1",
        userId: "user-1",
        token: "valid-token",
        expiresAt: new Date(Date.now() + 600000),
        usedAt: null,
      } as any);
      mockPrisma.user.update.mockResolvedValueOnce({} as any);
      (mockPrisma.passwordReset.update as any).mockResolvedValueOnce({} as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/reset-password",
        payload: { token: "valid-token", password: "newpass123" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("过期 token 返回 400", async () => {
      (mockPrisma.passwordReset.findUnique as any).mockResolvedValueOnce({
        id: "pr-2",
        userId: "user-1",
        token: "expired",
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/reset-password",
        payload: { token: "expired", password: "newpass123" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe("INVALID_TOKEN");
    });
  });
});
