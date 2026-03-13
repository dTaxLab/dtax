/**
 * Risk Scan Routes
 * POST /tax/risk-scan  — Run pre-audit risk scan
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { scanRisks, type RiskScanTransaction } from "@dtax/tax-engine";

export async function riskScanRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  r.post(
    "/tax/risk-scan",
    {
      schema: {
        tags: ["tax"],
        operationId: "runRiskScan",
        description: "Run pre-audit risk scan for a tax year",
        body: z.object({
          year: z.number().int().min(2009).max(2030),
        }),
        response: {
          200: z.object({
            data: z
              .any()
              .openapi({
                ref: "RiskScanResult",
                description: "Risk scan report",
              }),
          }),
        },
      },
    },
    async (request) => {
      const body = request.body;

      const transactions = await prisma.transaction.findMany({
        where: { userId: request.userId },
        select: {
          id: true,
          type: true,
          timestamp: true,
          sentAsset: true,
          sentAmount: true,
          sentValueUsd: true,
          receivedAsset: true,
          receivedAmount: true,
          receivedValueUsd: true,
          gainLoss: true,
          costBasis: true,
          aiClassified: true,
          aiConfidence: true,
        },
      });

      const scanTxs: RiskScanTransaction[] = transactions.map((tx) => ({
        id: tx.id,
        type: tx.type as RiskScanTransaction["type"],
        timestamp: tx.timestamp,
        sentAsset: tx.sentAsset || undefined,
        sentAmount: tx.sentAmount ? Number(tx.sentAmount) : undefined,
        sentValueUsd: tx.sentValueUsd ? Number(tx.sentValueUsd) : undefined,
        receivedAsset: tx.receivedAsset || undefined,
        receivedAmount: tx.receivedAmount
          ? Number(tx.receivedAmount)
          : undefined,
        receivedValueUsd: tx.receivedValueUsd
          ? Number(tx.receivedValueUsd)
          : undefined,
        gainLoss: tx.gainLoss ? Number(tx.gainLoss) : undefined,
        costBasis: tx.costBasis ? Number(tx.costBasis) : undefined,
        aiClassified: tx.aiClassified,
        aiConfidence: tx.aiConfidence || undefined,
      }));

      const report = scanRisks(scanTxs, body.year);

      return { data: report };
    },
  );
}
