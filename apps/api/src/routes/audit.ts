/**
 * Audit Log Routes
 * GET /audit — Query own audit logs with filtering and pagination
 */

import { FastifyInstance } from "fastify";
import { getAuditLogs } from "../lib/audit.js";
import { resolveUserId } from "../plugins/resolve-user.js";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // GET /audit — query own audit logs
  app.get(
    "/audit",
    {
      schema: {
        tags: ["audit"],
        summary: "Query audit logs",
        querystring: {
          type: "object" as const,
          properties: {
            action: { type: "string" as const },
            entityType: { type: "string" as const },
            from: { type: "string" as const, format: "date-time" },
            to: { type: "string" as const, format: "date-time" },
            limit: { type: "number" as const },
            offset: { type: "number" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              data: {
                type: "array" as const,
                items: { type: "object" as const, additionalProperties: true },
              },
              total: { type: "number" as const },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const query = request.query as {
        action?: string;
        entityType?: string;
        from?: string;
        to?: string;
        limit?: string;
        offset?: string;
      };

      const result = await getAuditLogs(userId, {
        action: query.action,
        entityType: query.entityType,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
      });

      return reply.send({ data: result.data, total: result.total });
    },
  );
}
