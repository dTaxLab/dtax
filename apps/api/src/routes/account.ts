/**
 * Account 管理路由
 * POST /account/export          — GDPR 数据导出
 * POST /account/delete          — 请求账号删除（30天宽限期）
 * POST /account/cancel-deletion — 取消待定的账号删除
 */

import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { generateUserDataExport } from "../lib/data-export";
import {
  requestAccountDeletion,
  cancelAccountDeletion,
} from "../lib/account-deletion";

/** Grace period in days before account is permanently deleted. */
const DELETION_GRACE_PERIOD_DAYS = 30;

/**
 * Register account management routes.
 *
 * Args:
 *   app: Fastify application instance.
 */
export async function accountRoutes(app: FastifyInstance): Promise<void> {
  // POST /account/export — GDPR data portability
  app.post(
    "/account/export",
    {
      schema: {
        tags: ["account"],
        summary: "Export all user data (GDPR Article 20)",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  exportedAt: { type: "string" as const },
                  metadata: {
                    type: "object" as const,
                    additionalProperties: true,
                    properties: {
                      transactionCount: { type: "number" as const },
                      taxReportCount: { type: "number" as const },
                      dataSourceCount: { type: "number" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const data = await generateUserDataExport(request.userId);
      return reply.send({ data });
    },
  );

  // POST /account/delete — Request account deletion with password verification
  app.post(
    "/account/delete",
    {
      schema: {
        tags: ["account"],
        summary: "Request account deletion (30-day grace period)",
        body: {
          type: "object" as const,
          required: ["password"],
          properties: {
            password: {
              type: "string" as const,
              description: "Current password for verification",
            },
            reason: {
              type: "string" as const,
              description: "Optional reason for deletion",
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
                  deletionScheduledAt: { type: "string" as const },
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
          401: {
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
      const { password, reason } = request.body as {
        password: string;
        reason?: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
      });

      if (!user) {
        return reply.status(404).send({
          data: null,
          error: { code: "NOT_FOUND", message: "User not found" },
        });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({
          data: null,
          error: { code: "INVALID_PASSWORD", message: "Invalid password" },
        });
      }

      await requestAccountDeletion(request.userId, reason);

      const scheduledDate = new Date(
        Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      );
      return reply.send({
        data: { deletionScheduledAt: scheduledDate.toISOString() },
      });
    },
  );

  // POST /account/cancel-deletion — Cancel pending account deletion
  app.post(
    "/account/cancel-deletion",
    {
      schema: {
        tags: ["account"],
        summary: "Cancel pending account deletion",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  cancelled: { type: "boolean" as const },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      await cancelAccountDeletion(request.userId);
      return reply.send({ data: { cancelled: true } });
    },
  );
}
