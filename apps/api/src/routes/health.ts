/**
 * Health check routes.
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

export async function healthRoutes(app: FastifyInstance) {
  // Basic health check
  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Basic health check",
        response: {
          200: {
            type: "object" as const,
            properties: {
              status: { type: "string" as const },
              timestamp: { type: "string" as const },
            },
          },
        },
      },
    },
    async () => {
      return { status: "ok", timestamp: new Date().toISOString() };
    },
  );

  // Deep health check (includes DB)
  app.get(
    "/health/deep",
    {
      schema: {
        tags: ["health"],
        summary: "Deep health check (includes database connectivity)",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              status: { type: "string" as const },
              timestamp: { type: "string" as const },
              services: {
                type: "object" as const,
                properties: {
                  database: { type: "string" as const },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: "ok",
          timestamp: new Date().toISOString(),
          services: {
            database: "connected",
          },
        };
      } catch {
        return {
          status: "degraded",
          timestamp: new Date().toISOString(),
          services: {
            database: "disconnected",
          },
        };
      }
    },
  );
}
