/**
 * Internal Transfer Matching Routes
 *
 * GET  /transfers/matches  — Detect potential internal transfers
 * POST /transfers/confirm  — Confirm a matched pair as INTERNAL_TRANSFER
 * POST /transfers/dismiss  — Dismiss a matched pair (mark as reviewed)
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { matchInternalTransfers } from "@dtax/tax-engine";
import type { TransferRecord } from "@dtax/tax-engine";
import { errorResponseSchema } from "../schemas/common";

const transferPairSchema = z
  .object({
    outTxId: z.string().uuid(),
    inTxId: z.string().uuid(),
  })
  .openapi({ ref: "TransferPairInput" });

const transferMatchSchema = z
  .object({
    outTx: z.object({
      id: z.string().uuid(),
      sourceId: z.string(),
      asset: z.string(),
      amount: z.number(),
      timestamp: z.string().datetime(),
    }),
    inTx: z.object({
      id: z.string().uuid(),
      sourceId: z.string(),
      asset: z.string(),
      amount: z.number(),
      timestamp: z.string().datetime(),
    }),
    amountDiff: z.number(),
    timeDiffMs: z.number(),
  })
  .openapi({ ref: "TransferMatch" });

export async function transferRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // GET /transfers/matches — Detect potential internal transfer pairs
  r.get(
    "/transfers/matches",
    {
      schema: {
        tags: ["transfers"],
        operationId: "listTransferMatches",
        description: "Detect potential internal transfer pairs",
        response: {
          200: z.object({
            data: z.object({
              matches: z.array(transferMatchSchema),
              unmatchedOut: z.number().int(),
              unmatchedIn: z.number().int(),
            }),
          }),
        },
      },
    },
    async (request, _reply) => {
      const transfers = await prisma.transaction.findMany({
        where: {
          userId: request.userId,
          type: { in: ["TRANSFER_IN", "TRANSFER_OUT"] },
          NOT: { tags: { has: "transfer_reviewed" } },
        },
        orderBy: { timestamp: "asc" },
      });

      const records: TransferRecord[] = transfers.map((tx) => ({
        id: tx.id,
        sourceId: tx.sourceId || "unknown",
        type: tx.type as "TRANSFER_IN" | "TRANSFER_OUT",
        timestamp: tx.timestamp,
        asset:
          (tx.type === "TRANSFER_OUT" ? tx.sentAsset : tx.receivedAsset) || "",
        amount:
          Number(
            tx.type === "TRANSFER_OUT" ? tx.sentAmount : tx.receivedAmount,
          ) || 0,
        feeAsset: tx.feeAsset || undefined,
        feeAmount: tx.feeAmount ? Number(tx.feeAmount) : undefined,
      }));

      const result = matchInternalTransfers(records);

      const enrichedMatches = result.matched.map((m) => ({
        outTx: {
          id: m.outTx.id,
          sourceId: m.outTx.sourceId,
          asset: m.outTx.asset,
          amount: m.outTx.amount,
          timestamp: m.outTx.timestamp.toISOString(),
        },
        inTx: {
          id: m.inTx.id,
          sourceId: m.inTx.sourceId,
          asset: m.inTx.asset,
          amount: m.inTx.amount,
          timestamp: m.inTx.timestamp.toISOString(),
        },
        amountDiff: m.outTx.amount - m.inTx.amount,
        timeDiffMs: m.inTx.timestamp.getTime() - m.outTx.timestamp.getTime(),
      }));

      return {
        data: {
          matches: enrichedMatches,
          unmatchedOut: result.unmatchedOut.length,
          unmatchedIn: result.unmatchedIn.length,
        },
      };
    },
  );

  // POST /transfers/confirm — Confirm a pair as internal transfer
  r.post(
    "/transfers/confirm",
    {
      schema: {
        tags: ["transfers"],
        operationId: "confirmTransfer",
        description: "Confirm a matched pair as internal transfer",
        body: transferPairSchema,
        response: {
          200: z.object({
            data: z.object({
              status: z.literal("confirmed"),
              outTxId: z.string().uuid(),
              inTxId: z.string().uuid(),
            }),
          }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      const [outTx, inTx] = await Promise.all([
        prisma.transaction.findFirst({
          where: { id: body.outTxId, userId: request.userId },
        }),
        prisma.transaction.findFirst({
          where: { id: body.inTxId, userId: request.userId },
        }),
      ]);

      if (!outTx || !inTx) {
        return reply.status(404).send({
          error: { message: "One or both transactions not found" },
        });
      }

      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: body.outTxId },
          data: {
            type: "INTERNAL_TRANSFER",
            originalType: outTx.originalType || outTx.type,
            notes: `Matched with ${body.inTxId}`,
          },
        }),
        prisma.transaction.update({
          where: { id: body.inTxId },
          data: {
            type: "INTERNAL_TRANSFER",
            originalType: inTx.originalType || inTx.type,
            notes: `Matched with ${body.outTxId}`,
          },
        }),
      ]);

      return {
        data: {
          status: "confirmed" as const,
          outTxId: body.outTxId,
          inTxId: body.inTxId,
        },
      };
    },
  );

  // POST /transfers/dismiss — Dismiss a match (keep as separate transfers)
  r.post(
    "/transfers/dismiss",
    {
      schema: {
        tags: ["transfers"],
        operationId: "dismissTransfer",
        description: "Dismiss a matched pair (mark as reviewed)",
        body: transferPairSchema,
        response: {
          200: z.object({
            data: z.object({ status: z.literal("dismissed") }),
          }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      const [outTx, inTx] = await Promise.all([
        prisma.transaction.findFirst({
          where: { id: body.outTxId, userId: request.userId },
        }),
        prisma.transaction.findFirst({
          where: { id: body.inTxId, userId: request.userId },
        }),
      ]);

      if (!outTx || !inTx) {
        return reply.status(404).send({
          error: { message: "One or both transactions not found" },
        });
      }

      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: body.outTxId },
          data: { tags: { push: "transfer_reviewed" } },
        }),
        prisma.transaction.update({
          where: { id: body.inTxId },
          data: { tags: { push: "transfer_reviewed" } },
        }),
      ]);

      return { data: { status: "dismissed" as const } };
    },
  );
}
