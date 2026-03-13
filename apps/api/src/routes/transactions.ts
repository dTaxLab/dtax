/**
 * Transaction CRUD routes.
 * POST /transactions       — Create transaction(s)
 * GET  /transactions       — List transactions (paginated)
 * GET  /transactions/:id   — Get single transaction
 * PUT  /transactions/:id   — Update transaction
 * DELETE /transactions/:id — Delete transaction
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { checkTransactionQuota } from "../plugins/plan-guard";
import { resolveUserId } from "../plugins/resolve-user.js";
import { logAudit } from "../lib/audit.js";

// ─── Validation Schemas ─────────────────────────

const createTransactionSchema = z.object({
  type: z.enum([
    "BUY",
    "SELL",
    "TRADE",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "AIRDROP",
    "STAKING_REWARD",
    "MINING_REWARD",
    "INTEREST",
    "GIFT_RECEIVED",
    "GIFT_SENT",
    "LOST",
    "STOLEN",
    "FORK",
    "MARGIN_TRADE",
    "LIQUIDATION",
    "INTERNAL_TRANSFER",
    "DEX_SWAP",
    "LP_DEPOSIT",
    "LP_WITHDRAWAL",
    "LP_REWARD",
    "WRAP",
    "UNWRAP",
    "BRIDGE_OUT",
    "BRIDGE_IN",
    "CONTRACT_APPROVAL",
    "NFT_MINT",
    "NFT_PURCHASE",
    "NFT_SALE",
    "UNKNOWN",
  ]),
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
});

const listQuerySchema = z.object({
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
});

// ─── OpenAPI/Swagger Schemas (documentation only) ────────────
// These schemas document the API for Swagger UI. Actual validation
// is performed by Zod in each handler. Response schemas use
// additionalProperties to avoid Fastify stripping extra fields.

const txTypeEnum = [
  "BUY",
  "SELL",
  "TRADE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "GIFT_RECEIVED",
  "GIFT_SENT",
  "LOST",
  "STOLEN",
  "FORK",
  "MARGIN_TRADE",
  "LIQUIDATION",
  "INTERNAL_TRANSFER",
  "DEX_SWAP",
  "LP_DEPOSIT",
  "LP_WITHDRAWAL",
  "LP_REWARD",
  "WRAP",
  "UNWRAP",
  "BRIDGE_OUT",
  "BRIDGE_IN",
  "CONTRACT_APPROVAL",
  "NFT_MINT",
  "NFT_PURCHASE",
  "NFT_SALE",
  "UNKNOWN",
] as const;

const transactionObjectSchema = {
  type: "object" as const,
  additionalProperties: true,
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    type: { type: "string", enum: txTypeEnum },
    timestamp: { type: "string", format: "date-time" },
    sentAsset: { type: "string", nullable: true },
    sentAmount: { type: "number", nullable: true },
    sentValueUsd: { type: "number", nullable: true },
    receivedAsset: { type: "string", nullable: true },
    receivedAmount: { type: "number", nullable: true },
    receivedValueUsd: { type: "number", nullable: true },
    feeAsset: { type: "string", nullable: true },
    feeAmount: { type: "number", nullable: true },
    feeValueUsd: { type: "number", nullable: true },
    notes: { type: "string", nullable: true },
    tags: { type: "array", items: { type: "string" } },
    sourceId: { type: "string", format: "uuid", nullable: true },
    externalId: { type: "string", nullable: true },
    originalType: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const idParamSchema = {
  type: "object" as const,
  required: ["id"] as const,
  properties: {
    id: { type: "string", description: "Transaction UUID" },
  },
};

// ─── Routes ─────────────────────────────────────

export async function transactionRoutes(app: FastifyInstance) {
  // POST /transactions — Create transaction(s)
  app.post(
    "/transactions",
    {
      schema: {
        tags: ["transactions"],
        summary: "Create a new transaction",
        body: {
          type: "object" as const,
          additionalProperties: true,
          properties: {
            type: {
              type: "string",
              description:
                "Transaction type. Required. One of: " + txTypeEnum.join(", "),
            },
            timestamp: {
              type: "string",
              format: "date-time",
              description: "ISO 8601 timestamp. Required.",
            },
            sentAsset: { type: "string" },
            sentAmount: { type: "number" },
            sentValueUsd: { type: "number" },
            receivedAsset: { type: "string" },
            receivedAmount: { type: "number" },
            receivedValueUsd: { type: "number" },
            feeAsset: { type: "string" },
            feeAmount: { type: "number" },
            feeValueUsd: { type: "number" },
            notes: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            sourceId: { type: "string", format: "uuid" },
          },
        },
        response: {
          201: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: transactionObjectSchema,
              meta: {
                type: "object",
                additionalProperties: true,
                properties: {
                  requestId: { type: "string" },
                  timestamp: { type: "string", format: "date-time" },
                },
              },
            },
          },
          403: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: {
                type: "object",
                additionalProperties: true,
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = createTransactionSchema.parse(request.body);

      // Enforce FREE plan transaction quota
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

      logAudit({
        userId: request.userId,
        action: "CREATE",
        entityType: "transaction",
        entityId: transaction.id,
        details: {
          type: body.type,
          asset: body.receivedAsset || body.sentAsset,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      return reply.status(201).send({
        data: transaction,
        meta: { requestId: request.id, timestamp: new Date().toISOString() },
      });
    },
  );

  // GET /transactions — List transactions (paginated)
  app.get(
    "/transactions",
    {
      schema: {
        tags: ["transactions"],
        summary: "List transactions with pagination, filtering, and sorting",
        querystring: {
          type: "object" as const,
          additionalProperties: true,
          properties: {
            page: {
              type: "integer",
              description: "Page number (min: 1, default: 1)",
            },
            limit: {
              type: "integer",
              description: "Items per page (1-100, default: 20)",
            },
            asset: { type: "string", description: "Filter by asset symbol" },
            type: {
              type: "string",
              description: "Filter by transaction type",
            },
            search: {
              type: "string",
              description: "Search notes, sentAsset, receivedAsset, externalId",
            },
            from: {
              type: "string",
              format: "date-time",
              description: "Start date filter",
            },
            to: {
              type: "string",
              format: "date-time",
              description: "End date filter",
            },
            sort: {
              type: "string",
              enum: [
                "timestamp",
                "type",
                "sentAmount",
                "receivedAmount",
                "sentValueUsd",
                "receivedValueUsd",
                "feeValueUsd",
              ],
              default: "timestamp",
            },
            order: { type: "string", enum: ["asc", "desc"], default: "desc" },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "array",
                items: transactionObjectSchema,
              },
              meta: {
                type: "object",
                additionalProperties: true,
                properties: {
                  total: { type: "integer" },
                  page: { type: "integer" },
                  limit: { type: "integer" },
                  totalPages: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);
      const query = listQuerySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      // Build where clause
      const where: Record<string, unknown> = { userId };
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
  app.get(
    "/transactions/export-json",
    {
      schema: {
        tags: ["transactions"],
        summary: "Export all user data as JSON backup (v1.1)",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            description: "JSON backup file download",
            properties: {
              version: { type: "string" },
              exportedAt: { type: "string", format: "date-time" },
              user: {
                type: "object",
                additionalProperties: true,
                properties: {
                  email: { type: "string" },
                  name: { type: "string", nullable: true },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
              transactions: {
                type: "array",
                items: transactionObjectSchema,
              },
              dataSources: { type: "array", items: { type: "object" } },
              taxReports: { type: "array", items: { type: "object" } },
              meta: {
                type: "object",
                additionalProperties: true,
                properties: {
                  transactionCount: { type: "integer" },
                  dataSourceCount: { type: "integer" },
                  taxReportCount: { type: "integer" },
                },
              },
            },
          },
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
  app.get(
    "/transactions/export",
    {
      schema: {
        tags: ["transactions"],
        summary: "Export transactions as CSV file",
        querystring: {
          type: "object" as const,
          additionalProperties: true,
          properties: {
            from: {
              type: "string",
              format: "date-time",
              description: "Start date filter",
            },
            to: {
              type: "string",
              format: "date-time",
              description: "End date filter",
            },
          },
        },
        response: {
          200: {
            type: "string" as const,
            description: "CSV file download",
          },
        },
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .parse(request.query);

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
  app.get(
    "/transactions/:id",
    {
      schema: {
        tags: ["transactions"],
        summary: "Get a single transaction by ID",
        params: idParamSchema,
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: transactionObjectSchema,
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: {
                type: "object",
                additionalProperties: true,
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

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
  app.put(
    "/transactions/:id",
    {
      schema: {
        tags: ["transactions"],
        summary: "Update an existing transaction",
        params: idParamSchema,
        body: {
          type: "object" as const,
          additionalProperties: true,
          description: "Partial transaction fields to update",
          properties: {
            type: { type: "string", enum: txTypeEnum },
            timestamp: { type: "string", format: "date-time" },
            sentAsset: { type: "string" },
            sentAmount: { type: "number", minimum: 0 },
            sentValueUsd: { type: "number", minimum: 0 },
            receivedAsset: { type: "string" },
            receivedAmount: { type: "number", minimum: 0 },
            receivedValueUsd: { type: "number", minimum: 0 },
            feeAsset: { type: "string" },
            feeAmount: { type: "number", minimum: 0 },
            feeValueUsd: { type: "number", minimum: 0 },
            notes: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            sourceId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: transactionObjectSchema,
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: {
                type: "object",
                additionalProperties: true,
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = createTransactionSchema.partial().parse(request.body);

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

      logAudit({
        userId: request.userId,
        action: "UPDATE",
        entityType: "transaction",
        entityId: id,
        details: { updatedFields: Object.keys(body) },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      return { data: updated };
    },
  );

  // DELETE /transactions/bulk — Bulk delete transactions
  app.delete(
    "/transactions/bulk",
    {
      schema: {
        tags: ["transactions"],
        summary: "Bulk delete transactions by IDs",
        body: {
          type: "object" as const,
          additionalProperties: true,
          required: ["ids"] as const,
          properties: {
            ids: {
              type: "array",
              items: { type: "string", format: "uuid" },
              minItems: 1,
              maxItems: 500,
            },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object",
                additionalProperties: true,
                properties: {
                  deleted: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const body = z
        .object({
          ids: z.array(z.string().uuid()).min(1).max(500),
        })
        .parse(request.body);

      const deleted = await prisma.transaction.deleteMany({
        where: {
          id: { in: body.ids },
          userId: request.userId,
        },
      });

      logAudit({
        userId: request.userId,
        action: "BULK_DELETE",
        entityType: "transaction",
        details: { count: deleted.count, ids: body.ids },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      return { data: { deleted: deleted.count } };
    },
  );

  // DELETE /transactions/:id — Delete transaction
  app.delete(
    "/transactions/:id",
    {
      schema: {
        tags: ["transactions"],
        summary: "Delete a single transaction",
        params: idParamSchema,
        response: {
          204: {
            type: "null" as const,
            description: "Transaction deleted successfully",
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: {
                type: "object",
                additionalProperties: true,
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

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

      logAudit({
        userId: request.userId,
        action: "DELETE",
        entityType: "transaction",
        entityId: id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      return reply.status(204).send();
    },
  );
}
