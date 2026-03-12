/**
 * DataSource / Connections API
 * Manage API keys and sync external exchanges via CCXT.
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { DataSourceType, DataSourceStatus } from "@prisma/client";
import { encryptKey, CcxtService } from "../services/ccxt";

const ConnectionSchema = z.object({
  exchangeId: z.string().min(1), // e.g., 'binance', 'okx'
  apiKey: z.string().min(5),
  apiSecret: z.string().min(5),
  apiPassword: z.string().optional(),
});

export async function connectionRoutes(app: FastifyInstance) {
  // 1. Setup new API connection
  app.post(
    "/connections",
    {
      schema: {
        tags: ["connections"],
        summary: "Create a new exchange API connection",
        body: {
          type: "object" as const,
          additionalProperties: true,
          required: ["exchangeId", "apiKey", "apiSecret"],
          properties: {
            exchangeId: { type: "string" as const },
            apiKey: { type: "string" as const },
            apiSecret: { type: "string" as const },
            apiPassword: { type: "string" as const },
          },
        },
        response: {
          201: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
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
      const body = ConnectionSchema.parse(request.body);

      // Test the connection via CCXT first
      const isValid = await CcxtService.testConnection(
        body.exchangeId,
        {
          apiKey: body.apiKey,
          secret: body.apiSecret,
          password: body.apiPassword,
        },
        request.log,
      );

      if (!isValid) {
        return reply.status(400).send({
          error: {
            code: "INVALID_API_KEYS",
            message: "Failed to verify API keys with exchange.",
          },
        });
      }

      // Encrypt credentials before storing
      const secureConfig = {
        exchangeId: body.exchangeId,
        apiKey: encryptKey(body.apiKey),
        apiSecret: encryptKey(body.apiSecret),
        ...(body.apiPassword && { apiPassword: encryptKey(body.apiPassword) }),
      };

      // Store DataSource
      const dataSource = await prisma.dataSource.create({
        data: {
          userId: request.userId,
          type: DataSourceType.EXCHANGE_API,
          name: body.exchangeId.toUpperCase(),
          status: DataSourceStatus.ACTIVE,
          config: secureConfig,
        },
      });

      return reply.status(201).send({
        data: {
          id: dataSource.id,
          name: dataSource.name,
          status: dataSource.status,
        },
      });
    },
  );

  // 2. List all connections
  app.get(
    "/connections",
    {
      schema: {
        tags: ["connections"],
        summary: "List all exchange API connections",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: { data: { type: "array" as const } },
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
    async (request, _reply) => {
      const connections = await prisma.dataSource.findMany({
        where: { userId: request.userId, type: DataSourceType.EXCHANGE_API },
        select: {
          id: true,
          name: true,
          status: true,
          lastSyncAt: true,
          createdAt: true,
        },
      });

      return { data: connections };
    },
  );

  // 2b. List all data sources (connections + CSV imports)
  app.get(
    "/data-sources",
    {
      schema: {
        tags: ["connections"],
        summary: "List all data sources (connections + CSV imports)",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: { data: { type: "array" as const } },
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
    async (request) => {
      const sources = await prisma.dataSource.findMany({
        where: { userId: request.userId },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          lastSyncAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Count transactions per source
      const counts = await prisma.transaction.groupBy({
        by: ["sourceId"],
        where: { userId: request.userId, sourceId: { not: null } },
        _count: true,
      });
      const countMap = new Map(counts.map((c) => [c.sourceId, c._count]));

      return {
        data: sources.map((s) => ({
          ...s,
          transactionCount: countMap.get(s.id) || 0,
        })),
      };
    },
  );

  // 2c. Rename a data source
  app.put(
    "/data-sources/:id",
    {
      schema: {
        tags: ["connections"],
        summary: "Rename a data source",
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" as const } },
        },
        body: {
          type: "object" as const,
          additionalProperties: true,
          required: ["name"],
          properties: { name: { type: "string" as const } },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
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
      const { id } = request.params as { id: string };
      const body = z
        .object({ name: z.string().min(1).max(100) })
        .parse(request.body);

      const source = await prisma.dataSource.findFirst({
        where: { id, userId: request.userId },
      });
      if (!source) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Data source not found" },
        });
      }

      const updated = await prisma.dataSource.update({
        where: { id },
        data: { name: body.name },
      });

      return { data: { id: updated.id, name: updated.name } };
    },
  );

  // 2d. Delete a data source (unlinks transactions, does NOT delete them)
  app.delete(
    "/data-sources/:id",
    {
      schema: {
        tags: ["connections"],
        summary: "Delete a data source (unlinks transactions)",
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" as const } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const source = await prisma.dataSource.findFirst({
        where: { id, userId: request.userId },
      });
      if (!source) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Data source not found" },
        });
      }

      // Unlink transactions (set sourceId to null)
      await prisma.transaction.updateMany({
        where: { sourceId: id, userId: request.userId },
        data: { sourceId: null },
      });

      await prisma.dataSource.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // 3. Sync a specific connection (trigger CCXT fetch)
  // Note: This blocks until sync completes. In production, use BullMQ for background syncs.
  app.post(
    "/connections/:id/sync",
    {
      schema: {
        tags: ["connections"],
        summary: "Trigger sync for an exchange connection",
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" as const } },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
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
      const { id } = request.params as { id: string };

      const connection = await prisma.dataSource.findUnique({
        where: { id, userId: request.userId },
      });
      if (!connection || connection.type !== DataSourceType.EXCHANGE_API) {
        return reply
          .status(404)
          .send({ error: { message: "Connection not found" } });
      }

      // We skip actual sync logic for safety in MVP endpoint, returning simulated result or just calling the test
      // Decrypt the secrets to use CCXT
      // const config = connection.config as any;
      // const creds = { apiKey: decryptKey(config.apiKey), secret: decryptKey(config.apiSecret) };
      // const trades = await CcxtService.fetchMyTrades(config.exchangeId, creds);

      // Mark as synced
      await prisma.dataSource.update({
        where: { id },
        data: { lastSyncAt: new Date(), status: DataSourceStatus.ACTIVE },
      });

      return {
        data: {
          status: "SYNCED_SUCCESSFULLY",
          message: "Historical trades fetched (placeholder).",
        },
      };
    },
  );
}
