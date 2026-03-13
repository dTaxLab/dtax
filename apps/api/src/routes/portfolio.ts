/**
 * Portfolio routes.
 * GET /portfolio/holdings — Aggregate holdings with optional TLH analysis
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { analyzeHoldings } from "@dtax/tax-engine";
import type { TaxLot, PriceMap } from "@dtax/tax-engine";
import { errorResponseSchema } from "../schemas/common";

export async function portfolioRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // GET /portfolio/holdings
  r.get(
    "/portfolio/holdings",
    {
      schema: {
        tags: ["portfolio"],
        operationId: "getPortfolioHoldings",
        description:
          "Aggregate holdings with optional tax-loss harvesting analysis",
        querystring: z.object({
          prices: z
            .string()
            .optional()
            .openapi({
              description: 'JSON map of asset prices, e.g. {"BTC":45000}',
            }),
        }),
        response: {
          200: z.object({
            data: z
              .any()
              .openapi({
                ref: "PortfolioHoldings",
                description: "Holdings analysis result",
              }),
          }),
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const query = request.query;

      let currentPrices: PriceMap | undefined;
      if (query.prices) {
        try {
          const parsed = JSON.parse(query.prices) as Record<string, number>;
          currentPrices = new Map(Object.entries(parsed));
        } catch {
          return reply.status(400).send({
            error: {
              message: 'Invalid prices format. Expected JSON: {"BTC":45000}',
            },
          });
        }
      }

      const acquisitions = await prisma.transaction.findMany({
        where: {
          userId: request.userId,
          type: {
            in: [
              "BUY",
              "TRADE",
              "AIRDROP",
              "STAKING_REWARD",
              "MINING_REWARD",
              "INTEREST",
              "FORK",
              "GIFT_RECEIVED",
              "DEX_SWAP",
              "LP_WITHDRAWAL",
              "LP_REWARD",
              "NFT_MINT",
            ],
          },
        },
        orderBy: { timestamp: "asc" },
      });

      const dispositions = await prisma.transaction.findMany({
        where: {
          userId: request.userId,
          type: {
            in: [
              "SELL",
              "TRADE",
              "GIFT_SENT",
              "LOST",
              "STOLEN",
              "DEX_SWAP",
              "LP_DEPOSIT",
              "NFT_PURCHASE",
              "NFT_SALE",
            ],
          },
        },
        orderBy: { timestamp: "asc" },
      });

      const rawLots: TaxLot[] = acquisitions.map((tx) => ({
        id: tx.id,
        asset: tx.receivedAsset || "",
        amount: Number(tx.receivedAmount || 0),
        costBasisUsd: Number(tx.receivedValueUsd || 0),
        acquiredAt: tx.timestamp,
        sourceId: tx.sourceId || "unknown",
      }));

      const disposedByAsset = new Map<string, number>();
      for (const tx of dispositions) {
        const asset = tx.sentAsset || "";
        const amount = Number(tx.sentAmount || 0);
        disposedByAsset.set(asset, (disposedByAsset.get(asset) || 0) + amount);
      }

      const remainingLots: TaxLot[] = [];
      const disposedRemaining = new Map(disposedByAsset);

      for (const lot of rawLots) {
        const disposed = disposedRemaining.get(lot.asset) || 0;
        if (disposed <= 0) {
          remainingLots.push(lot);
          continue;
        }

        if (disposed >= lot.amount) {
          disposedRemaining.set(lot.asset, disposed - lot.amount);
          continue;
        }

        const remaining = lot.amount - disposed;
        const costRatio = remaining / lot.amount;
        remainingLots.push({
          ...lot,
          amount: remaining,
          costBasisUsd: lot.costBasisUsd * costRatio,
        });
        disposedRemaining.set(lot.asset, 0);
      }

      const analysis = analyzeHoldings(remainingLots, currentPrices);

      return { data: analysis };
    },
  );
}
