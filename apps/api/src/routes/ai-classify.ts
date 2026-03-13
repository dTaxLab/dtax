/**
 * AI Classification Routes
 * POST /transactions/ai-classify      — Classify specific transactions by ID
 * POST /transactions/ai-classify-all  — Reclassify all UNKNOWN transactions
 * GET  /transactions/ai-stats         — AI classification statistics
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import {
  classifyTransaction,
  type ClassificationInput,
} from "../lib/ai-classifier";
import { errorResponseSchema } from "../schemas/common";

const classificationResultSchema = z
  .object({
    processed: z.number().int(),
    classified: z.number().int(),
    results: z.array(
      z.object({
        id: z.string().uuid(),
        originalType: z.string(),
        newType: z.string(),
        confidence: z.number(),
      }),
    ),
  })
  .openapi({ ref: "ClassificationResult" });

export async function aiClassifyRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // POST /transactions/ai-classify — classify specific transactions
  r.post(
    "/transactions/ai-classify",
    {
      schema: {
        tags: ["ai"],
        operationId: "aiClassifyTransactions",
        description: "Classify specific transactions by ID using AI",
        body: z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }),
        response: {
          200: z.object({
            data: classificationResultSchema,
          }),
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!config.anthropicApiKey) {
        return reply.status(503).send({
          error: {
            code: "AI_NOT_CONFIGURED",
            message:
              "AI classification is not configured. Set ANTHROPIC_API_KEY.",
          },
        });
      }

      const body = request.body;

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
    },
  );

  // POST /transactions/ai-classify-all — reclassify all UNKNOWN
  r.post(
    "/transactions/ai-classify-all",
    {
      schema: {
        tags: ["ai"],
        operationId: "aiClassifyAllUnknown",
        description: "Reclassify all UNKNOWN transactions using AI",
        response: {
          200: z.object({
            data: z.object({
              processed: z.number().int(),
              classified: z.number().int(),
              remaining: z.string().optional(),
            }),
          }),
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
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
        take: 200,
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
    },
  );

  // GET /transactions/ai-stats — classification statistics
  r.get(
    "/transactions/ai-stats",
    {
      schema: {
        tags: ["ai"],
        operationId: "getAiClassificationStats",
        description: "Get AI classification statistics for current user",
        response: {
          200: z.object({
            data: z.object({
              total: z.number().int(),
              aiClassified: z.number().int(),
              unknownCount: z.number().int(),
              aiEnabled: z.boolean(),
            }),
          }),
        },
      },
    },
    async (request) => {
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
    },
  );
}
