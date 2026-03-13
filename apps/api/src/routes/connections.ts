/**
 * DataSource / Connections API
 * Manage API keys and sync external exchanges via CCXT.
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { DataSourceType, DataSourceStatus } from "@prisma/client";
import { encryptKey, CcxtService } from "../services/ccxt";
import { errorResponseSchema, idParamSchema } from "../schemas/common";

const ConnectionSchema = z
  .object({
    exchangeId: z.string().min(1),
    apiKey: z.string().min(5),
    apiSecret: z.string().min(5),
    apiPassword: z.string().optional(),
  })
  .openapi({ ref: "ConnectionInput" });

const connectionResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.string(),
  })
  .openapi({ ref: "ConnectionResponse" });

const dataSourceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.string(),
    status: z.string(),
    lastSyncAt: z.date().nullable(),
    createdAt: z.date(),
    transactionCount: z.number().int().optional(),
  })
  .openapi({ ref: "DataSource" });

export async function connectionRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // 1. Setup new API connection
  r.post(
    "/connections",
    {
      schema: {
        tags: ["connections"],
        operationId: "createConnection",
        description: "Setup a new exchange API connection",
        body: ConnectionSchema,
        response: {
          201: z.object({ data: connectionResponseSchema }),
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

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

      const secureConfig = {
        exchangeId: body.exchangeId,
        apiKey: encryptKey(body.apiKey),
        apiSecret: encryptKey(body.apiSecret),
        ...(body.apiPassword && { apiPassword: encryptKey(body.apiPassword) }),
      };

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
  r.get(
    "/connections",
    {
      schema: {
        tags: ["connections"],
        operationId: "listConnections",
        description: "List all exchange API connections",
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string().uuid(),
                name: z.string(),
                status: z.string(),
                lastSyncAt: z.date().nullable(),
                createdAt: z.date(),
              }),
            ),
          }),
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
  r.get(
    "/data-sources",
    {
      schema: {
        tags: ["connections"],
        operationId: "listDataSources",
        description: "List all data sources (connections + CSV imports)",
        response: {
          200: z.object({
            data: z.array(dataSourceSchema),
          }),
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
  r.put(
    "/data-sources/:id",
    {
      schema: {
        tags: ["connections"],
        operationId: "renameDataSource",
        description: "Rename a data source",
        params: idParamSchema,
        body: z.object({ name: z.string().min(1).max(100) }),
        response: {
          200: z.object({
            data: z.object({ id: z.string().uuid(), name: z.string() }),
          }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

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
  r.delete(
    "/data-sources/:id",
    {
      schema: {
        tags: ["connections"],
        operationId: "deleteDataSource",
        description:
          "Delete a data source (unlinks transactions, does NOT delete them)",
        params: idParamSchema,
        response: {
          204: z
            .any()
            .openapi({ type: "string", description: "Data source deleted" }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const source = await prisma.dataSource.findFirst({
        where: { id, userId: request.userId },
      });
      if (!source) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Data source not found" },
        });
      }

      await prisma.transaction.updateMany({
        where: { sourceId: id, userId: request.userId },
        data: { sourceId: null },
      });

      await prisma.dataSource.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // 3. Sync a specific connection (trigger CCXT fetch)
  r.post(
    "/connections/:id/sync",
    {
      schema: {
        tags: ["connections"],
        operationId: "syncConnection",
        description: "Trigger sync for a specific exchange connection",
        params: idParamSchema,
        response: {
          200: z.object({
            data: z.object({
              status: z.string(),
              message: z.string(),
            }),
          }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const connection = await prisma.dataSource.findUnique({
        where: { id, userId: request.userId },
      });
      if (!connection || connection.type !== DataSourceType.EXCHANGE_API) {
        return reply
          .status(404)
          .send({ error: { message: "Connection not found" } });
      }

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
