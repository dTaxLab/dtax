/**
 * Transaction CRUD routes.
 * POST /transactions       — Create transaction(s)
 * GET  /transactions       — List transactions (paginated)
 * GET  /transactions/:id   — Get single transaction
 * PUT  /transactions/:id   — Update transaction
 * DELETE /transactions/:id — Delete transaction
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { checkTransactionQuota } from "../plugins/plan-guard";
import {
  errorResponseSchema,
  idParamSchema,
  paginationMetaSchema,
} from "../schemas/common";
import { txTypeEnum } from "../schemas/enums";

// ─── Validation Schemas ─────────────────────────

const createTransactionSchema = z
  .object({
    type: txTypeEnum,
    timestamp: z.string().datetime(),
    sentAsset: z.string().optional(),
    sentAmount: z.number().nonnegative().optional(),
    sentValueUsd: z.number().nonnegative().optional(),
    receivedAsset: z.string().optional(),
    receivedAmount: z.number().nonnegative().optional(),
    receivedValueUsd: z.number().nonnegative().optional(),
    feeAsset: z.string().optional(),
    feeAmount: z.number().nonnegative().optional(),
    feeValueUsd: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    sourceId: z.string().uuid().optional(),
  })
  .openapi({ ref: "CreateTransactionInput" });

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    asset: z.string().optional(),
    type: z.string().optional(),
    search: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    sort: z
      .enum([
        "timestamp",
        "type",
        "sentAmount",
        "receivedAmount",
        "sentValueUsd",
        "receivedValueUsd",
        "feeValueUsd",
      ])
      .default("timestamp"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .openapi({ ref: "ListTransactionsQuery" });

const transactionSchema = z
  .any()
  .openapi({ ref: "Transaction", description: "Transaction object" });

// ─── Routes ─────────────────────────────────────

export async function transactionRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // POST /transactions — Create transaction(s)
  r.post(
    "/transactions",
    {
      schema: {
        tags: ["transactions"],
        operationId: "createTransaction",
        description: "Create a new transaction",
        body: createTransactionSchema,
        response: {
          201: z.object({
            data: transactionSchema,
            meta: z.object({
              requestId: z.string(),
              timestamp: z.string().datetime(),
            }),
          }),
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      const quota = await checkTransactionQuota(request.userId);
      if (!quota.allowed) {
        return reply.status(403).send({
          error: {
            code: "QUOTA_EXCEEDED",
            message: `Free plan limit of ${quota.limit} transactions reached (current: ${quota.current}). Upgrade to Pro for unlimited.`,
            limit: quota.limit,
            current: quota.current,
          },
        });
      }

      const transaction = await prisma.transaction.create({
        data: {
          userId: request.userId,
          type: body.type,
          timestamp: new Date(body.timestamp),
          sentAsset: body.sentAsset,
          sentAmount: body.sentAmount,
          sentValueUsd: body.sentValueUsd,
          receivedAsset: body.receivedAsset,
          receivedAmount: body.receivedAmount,
          receivedValueUsd: body.receivedValueUsd,
          feeAsset: body.feeAsset,
          feeAmount: body.feeAmount,
          feeValueUsd: body.feeValueUsd,
          notes: body.notes,
          tags: body.tags || [],
          sourceId: body.sourceId,
        },
      });

      return reply.status(201).send({
        data: transaction,
        meta: { requestId: request.id, timestamp: new Date().toISOString() },
      });
    },
  );

  // GET /transactions — List transactions (paginated)
  r.get(
    "/transactions",
    {
      schema: {
        tags: ["transactions"],
        operationId: "listTransactions",
        description:
          "List transactions with pagination, filtering, and sorting",
        querystring: listQuerySchema,
        response: {
          200: z.object({
            data: z.array(transactionSchema),
            meta: paginationMetaSchema,
          }),
        },
      },
    },
    async (request) => {
      const query = request.query;
      const skip = (query.page - 1) * query.limit;

      const where: Record<string, unknown> = { userId: request.userId };
      const andClauses: Record<string, unknown>[] = [];
      if (query.type) where.type = query.type;
      if (query.asset) {
        andClauses.push({
          OR: [{ sentAsset: query.asset }, { receivedAsset: query.asset }],
        });
      }
      if (query.from || query.to) {
        where.timestamp = {};
        if (query.from)
          (where.timestamp as Record<string, unknown>).gte = new Date(
            query.from,
          );
        if (query.to)
          (where.timestamp as Record<string, unknown>).lte = new Date(query.to);
      }
      if (query.search) {
        const term = query.search;
        andClauses.push({
          OR: [
            { notes: { contains: term, mode: "insensitive" } },
            { sentAsset: { contains: term, mode: "insensitive" } },
            { receivedAsset: { contains: term, mode: "insensitive" } },
            { externalId: { contains: term, mode: "insensitive" } },
          ],
        });
      }
      if (andClauses.length > 0) where.AND = andClauses;

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          orderBy: { [query.sort]: query.order },
          skip,
          take: query.limit,
        }),
        prisma.transaction.count({ where }),
      ]);

      return {
        data: transactions,
        meta: {
          total,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },
  );

  // GET /transactions/export-json — Export all data as JSON backup
  r.get(
    "/transactions/export-json",
    {
      schema: {
        tags: ["transactions"],
        operationId: "exportTransactionsJson",
        description: "Export all user data as JSON backup",
        response: {
          200: z.any().openapi({ description: "JSON backup file" }),
        },
      },
    },
    async (request, reply) => {
      const [transactions, dataSources, taxReports, user] = await Promise.all([
        prisma.transaction.findMany({
          where: { userId: request.userId },
          orderBy: { timestamp: "asc" },
        }),
        prisma.dataSource.findMany({
          where: { userId: request.userId },
        }),
        prisma.taxReport.findMany({
          where: { userId: request.userId },
          orderBy: { taxYear: "desc" },
        }),
        prisma.user.findUnique({
          where: { id: request.userId },
          select: { email: true, name: true, createdAt: true },
        }),
      ]);

      const backup = {
        version: "1.1",
        exportedAt: new Date().toISOString(),
        user: user || undefined,
        transactions,
        dataSources,
        taxReports,
        meta: {
          transactionCount: transactions.length,
          dataSourceCount: dataSources.length,
          taxReportCount: taxReports.length,
        },
      };

      return reply
        .header("Content-Type", "application/json")
        .header(
          "Content-Disposition",
          'attachment; filename="dtax-backup.json"',
        )
        .send(JSON.stringify(backup, null, 2));
    },
  );

  // GET /transactions/export — Export all transactions as CSV
  r.get(
    "/transactions/export",
    {
      schema: {
        tags: ["transactions"],
        operationId: "exportTransactionsCsv",
        description: "Export transactions as CSV file",
        querystring: z.object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
        response: {
          200: z.any().openapi({ description: "CSV file content" }),
        },
      },
    },
    async (request, reply) => {
      const query = request.query;

      const where: Record<string, unknown> = { userId: request.userId };
      if (query.from || query.to) {
        where.timestamp = {};
        if (query.from)
          (where.timestamp as Record<string, unknown>).gte = new Date(
            query.from,
          );
        if (query.to)
          (where.timestamp as Record<string, unknown>).lte = new Date(query.to);
      }

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { timestamp: "asc" },
      });

      const headers = [
        "Date",
        "Type",
        "Sent Asset",
        "Sent Amount",
        "Sent Value (USD)",
        "Received Asset",
        "Received Amount",
        "Received Value (USD)",
        "Fee Asset",
        "Fee Amount",
        "Fee Value (USD)",
        "Notes",
      ];

      const escapeCsv = (val: string | null | undefined): string => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = transactions.map((tx) =>
        [
          tx.timestamp.toISOString(),
          tx.type,
          escapeCsv(tx.sentAsset),
          tx.sentAmount?.toString() || "",
          tx.sentValueUsd?.toString() || "",
          escapeCsv(tx.receivedAsset),
          tx.receivedAmount?.toString() || "",
          tx.receivedValueUsd?.toString() || "",
          escapeCsv(tx.feeAsset),
          tx.feeAmount?.toString() || "",
          tx.feeValueUsd?.toString() || "",
          escapeCsv(tx.notes),
        ].join(","),
      );

      const csv = [headers.join(","), ...rows].join("\n");

      return reply
        .header("Content-Type", "text/csv")
        .header(
          "Content-Disposition",
          'attachment; filename="dtax-transactions.csv"',
        )
        .send(csv);
    },
  );

  // GET /transactions/:id — Get single transaction
  r.get(
    "/transactions/:id",
    {
      schema: {
        tags: ["transactions"],
        operationId: "getTransaction",
        description: "Get a single transaction by ID",
        params: idParamSchema,
        response: {
          200: z.object({ data: transactionSchema }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const transaction = await prisma.transaction.findFirst({
        where: { id, userId: request.userId },
      });

      if (!transaction) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: `Transaction ${id} not found`,
          },
        });
      }

      return { data: transaction };
    },
  );

  // PUT /transactions/:id — Update transaction
  r.put(
    "/transactions/:id",
    {
      schema: {
        tags: ["transactions"],
        operationId: "updateTransaction",
        description: "Update a transaction",
        params: idParamSchema,
        body: createTransactionSchema.partial(),
        response: {
          200: z.object({ data: transactionSchema }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const existing = await prisma.transaction.findFirst({
        where: { id, userId: request.userId },
      });

      if (!existing) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: `Transaction ${id} not found`,
          },
        });
      }

      const updated = await prisma.transaction.update({
        where: { id },
        data: {
          ...body,
          timestamp: body.timestamp ? new Date(body.timestamp) : undefined,
        },
      });

      return { data: updated };
    },
  );

  // DELETE /transactions/bulk — Bulk delete transactions
  r.delete(
    "/transactions/bulk",
    {
      schema: {
        tags: ["transactions"],
        operationId: "bulkDeleteTransactions",
        description: "Bulk delete transactions by ID",
        body: z.object({
          ids: z.array(z.string().uuid()).min(1).max(500),
        }),
        response: {
          200: z.object({ data: z.object({ deleted: z.number().int() }) }),
        },
      },
    },
    async (request, _reply) => {
      const body = request.body;

      const deleted = await prisma.transaction.deleteMany({
        where: {
          id: { in: body.ids },
          userId: request.userId,
        },
      });

      return { data: { deleted: deleted.count } };
    },
  );

  // DELETE /transactions/:id — Delete transaction
  r.delete(
    "/transactions/:id",
    {
      schema: {
        tags: ["transactions"],
        operationId: "deleteTransaction",
        description: "Delete a single transaction",
        params: idParamSchema,
        response: {
          204: z
            .any()
            .openapi({ type: "string", description: "Transaction deleted" }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.transaction.findFirst({
        where: { id, userId: request.userId },
      });

      if (!existing) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: `Transaction ${id} not found`,
          },
        });
      }

      await prisma.transaction.delete({ where: { id } });

      return reply.status(204).send();
    },
  );
}
