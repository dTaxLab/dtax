/**
 * AI Classify Routes 测试
 * 测试批量分类、全部重分类、统计端点
 */

import "zod-openapi/extend";

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import { fastifyZodOpenApiPlugin } from "fastify-zod-openapi";
import { hybridValidatorCompiler } from "./test-helpers";
import { aiClassifyRoutes } from "../routes/ai-classify";

// Mock Prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock config
vi.mock("../config", () => ({
  config: {
    jwtSecret: "test-secret",
    anthropicApiKey: "sk-test",
  },
}));

// Mock AI classifier
vi.mock("../lib/ai-classifier", () => ({
  classifyTransaction: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import { config } from "../config";
import { classifyTransaction } from "../lib/ai-classifier";

const mockPrisma = vi.mocked(prisma);
const mockClassify = vi.mocked(classifyTransaction);
const mutableConfig = config as { anthropicApiKey: string };

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(fastifyZodOpenApiPlugin);
  app.setValidatorCompiler(hybridValidatorCompiler);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));
  app.register(jwt, { secret: "test-secret", sign: { expiresIn: "7d" } });
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (request) => {
    request.userId = "user-1";
    request.userRole = "USER";
  });
  app.setErrorHandler((error: Error, _request, reply) => {
    const errAny = error as Error & {
      validation?: unknown[];
      statusCode?: number;
    };
    if (errAny.validation) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: errAny.validation,
        },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Validation failed" },
      });
    }
    return reply.status(500).send({ error: { message: error.message } });
  });
  app.register(aiClassifyRoutes, { prefix: "/api/v1" });
  return app;
}

describe("AI Classify Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /transactions/ai-classify", () => {
    it("成功分类 UNKNOWN → BUY", async () => {
      mutableConfig.anthropicApiKey = "sk-test";
      const txId = "550e8400-e29b-41d4-a716-446655440001";
      (mockPrisma.transaction.findMany as any).mockResolvedValueOnce([
        {
          id: txId,
          type: "UNKNOWN",
          sentAsset: null,
          sentAmount: null,
          receivedAsset: "BTC",
          receivedAmount: 0.5,
          feeAsset: null,
          feeAmount: null,
          notes: null,
        },
      ]);
      mockClassify.mockResolvedValueOnce({
        classifiedType: "BUY",
        confidence: 0.95,
        reasoning: "Received BTC",
        model: "claude-haiku-4-5-20251001",
      });
      (mockPrisma.transaction.update as any).mockResolvedValueOnce({});

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/ai-classify",
        payload: { ids: [txId] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.classified).toBe(1);
      expect(body.data.results[0].newType).toBe("BUY");
    });

    it("无 API key 返回 503", async () => {
      mutableConfig.anthropicApiKey = "";

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/ai-classify",
        payload: { ids: ["550e8400-e29b-41d4-a716-446655440001"] },
      });

      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).error.code).toBe("AI_NOT_CONFIGURED");
      mutableConfig.anthropicApiKey = "sk-test";
    });

    it("空 ids 数组返回 400", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/ai-classify",
        payload: { ids: [] },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /transactions/ai-classify-all", () => {
    it("批量重分类 UNKNOWN 交易", async () => {
      mutableConfig.anthropicApiKey = "sk-test";
      (mockPrisma.transaction.findMany as any).mockResolvedValueOnce([
        {
          id: "tx-1",
          type: "UNKNOWN",
          sentAsset: "ETH",
          sentAmount: 1.0,
          receivedAsset: null,
          receivedAmount: null,
          feeAsset: null,
          feeAmount: null,
          notes: null,
        },
      ]);
      mockClassify.mockResolvedValueOnce({
        classifiedType: "SELL",
        confidence: 0.88,
        reasoning: "Sent ETH",
        model: "claude-sonnet-4-6",
      });
      (mockPrisma.transaction.update as any).mockResolvedValueOnce({});

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/ai-classify-all",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.classified).toBe(1);
    });

    it("无 API key 返回 503", async () => {
      mutableConfig.anthropicApiKey = "";

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/ai-classify-all",
      });

      expect(res.statusCode).toBe(503);
      mutableConfig.anthropicApiKey = "sk-test";
    });
  });

  describe("GET /transactions/ai-stats", () => {
    it("返回正确统计", async () => {
      mutableConfig.anthropicApiKey = "sk-test";
      (mockPrisma.transaction.count as any)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(15) // aiClassified
        .mockResolvedValueOnce(5); // unknown

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/transactions/ai-stats",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.total).toBe(100);
      expect(body.data.aiClassified).toBe(15);
      expect(body.data.unknownCount).toBe(5);
      expect(body.data.aiEnabled).toBe(true);
    });
  });
});
