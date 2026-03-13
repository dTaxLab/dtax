/**
 * Shared test helpers for API route testing.
 * Provides a buildApp() function that creates a Fastify instance
 * with mocked Prisma, suitable for inject()-based testing.
 */

import "zod-openapi/extend";

import Fastify from "fastify";
import { ZodError, ZodType } from "zod";
import {
  fastifyZodOpenApiPlugin,
  validatorCompiler as zodValidatorCompiler,
} from "fastify-zod-openapi";
import Ajv from "ajv";
import addFormats from "ajv-formats";

// 引入 auth 插件的类型声明
import "../plugins/auth";

const ajv = new Ajv({ allErrors: true, coerceTypes: true });
addFormats(ajv);

/**
 * Hybrid validator compiler: routes with zod schemas use zod-openapi,
 * routes with traditional JSON schemas use ajv.
 */
export const hybridValidatorCompiler: typeof zodValidatorCompiler = (req) => {
  // ZodType instances have a safeParse method
  if (req.schema && req.schema instanceof ZodType) {
    return zodValidatorCompiler(req);
  }
  // Traditional JSON schema — compile with ajv
  const validate = ajv.compile(req.schema as Record<string, unknown>);
  return (data: unknown) => {
    const valid = validate(data);
    if (!valid) {
      return {
        error: Object.assign(new Error(ajv.errorsText(validate.errors)), {
          validation: validate.errors,
        }),
      };
    }
    return { value: data as unknown };
  };
};

/** Creates a Fastify app with mocked auth and global error handler (no DB, no plugins) */
export function buildApp() {
  const app = Fastify({ logger: false });

  // Register zod-openapi plugin + hybrid validator supporting both zod and JSON schemas
  app.register(fastifyZodOpenApiPlugin);
  app.setValidatorCompiler(hybridValidatorCompiler);
  // Permissive serializer — response schemas for OpenAPI docs only, not runtime validation
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  // 模拟认证 — 为测试注入默认用户
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (request) => {
    request.userId = "00000000-0000-0000-0000-000000000001";
    request.userRole = "USER";
  });

  // Mirror the global error handler from src/index.ts
  app.setErrorHandler((error: Error, _request, reply) => {
    // Fastify validation errors (from validatorCompiler)
    const errWithValidation = error as Error & {
      validation?: unknown[];
      statusCode?: number;
    };
    if (errWithValidation.validation) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: errWithValidation.validation,
        },
      });
    }

    // Zod validation errors (from manual .parse())
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: issues,
        },
      });
    }

    const errorWithCode = error as Error & {
      code?: string;
      statusCode?: number;
    };
    if (errorWithCode.code === "P2025") {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Record not found" },
      });
    }

    return reply.status(errorWithCode.statusCode || 500).send({
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  });

  return app;
}

/** Generates a mock transaction row matching Prisma schema */
export function mockTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000099",
    userId: "00000000-0000-0000-0000-000000000001",
    type: "BUY",
    timestamp: new Date("2025-03-01T10:00:00Z"),
    sentAsset: null,
    sentAmount: null,
    sentValueUsd: null,
    receivedAsset: "BTC",
    receivedAmount: 1.5,
    receivedValueUsd: 45000,
    feeAsset: "USD",
    feeAmount: 10,
    feeValueUsd: 10,
    notes: null,
    tags: [],
    sourceId: "binance",
    externalId: null,
    originalType: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
