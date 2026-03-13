/**
 * Health check routes.
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { prisma } from "../lib/prisma";

const healthStatusSchema = z
  .object({
    status: z.string(),
    timestamp: z.string().datetime(),
  })
  .openapi({ ref: "HealthStatus" });

const deepHealthStatusSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    timestamp: z.string().datetime(),
    services: z.object({
      database: z.enum(["connected", "disconnected"]),
    }),
  })
  .openapi({ ref: "DeepHealthStatus" });

export async function healthRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();

  // Basic health check
  r.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        operationId: "healthCheck",
        description: "Basic health check",
        security: [],
        response: {
          200: healthStatusSchema,
        },
      },
    },
    async () => {
      return { status: "ok", timestamp: new Date().toISOString() };
    },
  );

  // Deep health check (includes DB)
  r.get(
    "/health/deep",
    {
      schema: {
        tags: ["health"],
        operationId: "healthCheckDeep",
        description: "Deep health check including database connectivity",
        security: [],
        response: {
          200: deepHealthStatusSchema,
        },
      },
    },
    async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: "ok" as const,
          timestamp: new Date().toISOString(),
          services: {
            database: "connected" as const,
          },
        };
      } catch {
        return {
          status: "degraded" as const,
          timestamp: new Date().toISOString(),
          services: {
            database: "disconnected" as const,
          },
        };
      }
    },
  );
}
