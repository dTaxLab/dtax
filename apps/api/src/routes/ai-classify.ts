/**
 * AI Classification Routes
 * POST /transactions/ai-classify      — Classify specific transactions by ID
 * POST /transactions/ai-classify-all  — Reclassify all UNKNOWN transactions
 * GET  /transactions/ai-stats         — AI classification statistics
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import {
  classifyTransaction,
  type ClassificationInput,
} from "../lib/ai-classifier";

export async function aiClassifyRoutes(app: FastifyInstance) {
  // POST /transactions/ai-classify — classify specific transactions
  app.post("/transactions/ai-classify", async (request, reply) => {
    if (!config.anthropicApiKey) {
      return reply.status(503).send({
        error: {
          code: "AI_NOT_CONFIGURED",
          message:
            "AI classification is not configured. Set ANTHROPIC_API_KEY.",
        },
      });
    }

    const body = z
      .object({ ids: z.array(z.string().uuid()).min(1).max(100) })
      .parse(request.body);

    const transactions = await prisma.transaction.findMany({
      where: { id: { in: body.ids }, userId: request.userId },
    });

    let classified = 0;
    const results: Array<{
      id: string;
      originalType: string;
      newType: string;
      confidence: number;
    }> = [];

    for (const tx of transactions) {
      const input: ClassificationInput = {
        type: tx.type,
        sentAsset: tx.sentAsset || undefined,
        sentAmount: tx.sentAmount ? Number(tx.sentAmount) : undefined,
        receivedAsset: tx.receivedAsset || undefined,
        receivedAmount: tx.receivedAmount
          ? Number(tx.receivedAmount)
          : undefined,
        feeAsset: tx.feeAsset || undefined,
        feeAmount: tx.feeAmount ? Number(tx.feeAmount) : undefined,
        notes: tx.notes || undefined,
      };

      const result = await classifyTransaction(input);
      if (result && result.classifiedType !== tx.type) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            originalType: tx.type,
            type: result.classifiedType,
            aiClassified: true,
            aiConfidence: result.confidence,
          },
        });
        results.push({
          id: tx.id,
          originalType: tx.type,
          newType: result.classifiedType,
          confidence: result.confidence,
        });
        classified++;
      }
    }

    return {
      data: {
        processed: transactions.length,
        classified,
        results,
      },
    };
  });

  // POST /transactions/ai-classify-all — reclassify all UNKNOWN
  app.post("/transactions/ai-classify-all", async (request, reply) => {
    if (!config.anthropicApiKey) {
      return reply.status(503).send({
        error: {
          code: "AI_NOT_CONFIGURED",
          message:
            "AI classification is not configured. Set ANTHROPIC_API_KEY.",
        },
      });
    }

    const unknownTxs = await prisma.transaction.findMany({
      where: { userId: request.userId, type: "UNKNOWN" },
      take: 200, // Limit batch size
    });

    let classified = 0;

    for (const tx of unknownTxs) {
      const input: ClassificationInput = {
        type: tx.type,
        sentAsset: tx.sentAsset || undefined,
        sentAmount: tx.sentAmount ? Number(tx.sentAmount) : undefined,
        receivedAsset: tx.receivedAsset || undefined,
        receivedAmount: tx.receivedAmount
          ? Number(tx.receivedAmount)
          : undefined,
        feeAsset: tx.feeAsset || undefined,
        feeAmount: tx.feeAmount ? Number(tx.feeAmount) : undefined,
        notes: tx.notes || undefined,
      };

      const result = await classifyTransaction(input);
      if (result && result.classifiedType !== "UNKNOWN") {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            originalType: tx.type,
            type: result.classifiedType,
            aiClassified: true,
            aiConfidence: result.confidence,
          },
        });
        classified++;
      }
    }

    return {
      data: {
        processed: unknownTxs.length,
        classified,
        remaining:
          unknownTxs.length === 200
            ? "More UNKNOWN transactions may exist. Run again."
            : undefined,
      },
    };
  });

  // GET /transactions/ai-stats — classification statistics
  app.get("/transactions/ai-stats", async (request) => {
    const [total, aiClassifiedCount, unknownCount] = await Promise.all([
      prisma.transaction.count({ where: { userId: request.userId } }),
      prisma.transaction.count({
        where: { userId: request.userId, aiClassified: true },
      }),
      prisma.transaction.count({
        where: { userId: request.userId, type: "UNKNOWN" },
      }),
    ]);

    return {
      data: {
        total,
        aiClassified: aiClassifiedCount,
        unknownCount,
        aiEnabled: !!config.anthropicApiKey,
      },
    };
  });
}
