/**
 * Portfolio routes.
 * GET /portfolio/holdings — Aggregate holdings with optional TLH analysis
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { resolveUserId } from "../plugins/resolve-user.js";
import { analyzeHoldings } from "@dtax/tax-engine";
import type { TaxLot, PriceMap } from "@dtax/tax-engine";

export async function portfolioRoutes(app: FastifyInstance) {
  // GET /portfolio/holdings
  app.get(
    "/portfolio/holdings",
    {
      schema: {
        tags: ["portfolio"],
        summary:
          "Aggregate portfolio holdings with optional current prices for TLH analysis",
        querystring: {
          type: "object" as const,
          additionalProperties: true,
          properties: {
            prices: {
              type: "string" as const,
              description:
                'JSON map of asset prices, e.g. {"BTC":45000,"ETH":2500}',
            },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  holdings: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                      properties: {
                        asset: { type: "string" as const },
                        totalAmount: { type: "number" as const },
                        totalCostBasis: { type: "number" as const },
                        currentValue: {
                          type: "number" as const,
                          nullable: true,
                        },
                        unrealizedGainLoss: {
                          type: "number" as const,
                          nullable: true,
                        },
                      },
                    },
                  },
                  tlhOpportunities: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: {
                type: "object" as const,
                additionalProperties: true,
                properties: { message: { type: "string" as const } },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const query = z
        .object({ prices: z.string().optional() })
        .parse(request.query);

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
          userId,
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
          userId,
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
