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

// ─── Routes ─────────────────────────────────────

export async function transactionRoutes(app: FastifyInstance) {
  // POST /transactions — Create transaction(s)
  app.post("/transactions", async (request, reply) => {
    const body = createTransactionSchema.parse(request.body);

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
  });

  // GET /transactions — List transactions (paginated)
  app.get("/transactions", async (request) => {
    const query = listQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    // Build where clause
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
        (where.timestamp as Record<string, unknown>).gte = new Date(query.from);
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
  });

  // GET /transactions/export-json — Export all data as JSON backup
  app.get("/transactions/export-json", async (request, reply) => {
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
      .header("Content-Disposition", 'attachment; filename="dtax-backup.json"')
      .send(JSON.stringify(backup, null, 2));
  });

  // GET /transactions/export — Export all transactions as CSV
  app.get("/transactions/export", async (request, reply) => {
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
        (where.timestamp as Record<string, unknown>).gte = new Date(query.from);
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
  });

  // GET /transactions/:id — Get single transaction
  app.get("/transactions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const transaction = await prisma.transaction.findFirst({
      where: { id, userId: request.userId },
    });

    if (!transaction) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: `Transaction ${id} not found` },
      });
    }

    return { data: transaction };
  });

  // PUT /transactions/:id — Update transaction
  app.put("/transactions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createTransactionSchema.partial().parse(request.body);

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: request.userId },
    });

    if (!existing) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: `Transaction ${id} not found` },
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
  });

  // DELETE /transactions/bulk — Bulk delete transactions
  app.delete("/transactions/bulk", async (request, reply) => {
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

    return { data: { deleted: deleted.count } };
  });

  // DELETE /transactions/:id — Delete transaction
  app.delete("/transactions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: request.userId },
    });

    if (!existing) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: `Transaction ${id} not found` },
      });
    }

    await prisma.transaction.delete({ where: { id } });

    return reply.status(204).send();
  });
}
