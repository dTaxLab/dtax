/**
 * Price routes.
 * GET  /prices           — Fetch current USD prices for assets
 * GET  /prices/supported — List supported tickers
 * GET  /prices/history   — Fetch historical price for a single asset+date
 * POST /prices/backfill  — Backfill missing USD values for user's transactions
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  fetchPrices,
  fetchHistoricalPrice,
  getSupportedTickers,
  fetchExchangeRates,
} from "../lib/prices";
import { prisma } from "../lib/prisma";

const errorSchema = {
  type: "object" as const,
  additionalProperties: true,
  properties: {
    error: {
      type: "object" as const,
      additionalProperties: true,
      properties: {
        message: { type: "string" as const },
        code: { type: "string" as const },
      },
    },
  },
};

export async function priceRoutes(app: FastifyInstance) {
  // GET /prices?assets=BTC,ETH,SOL
  app.get(
    "/prices",
    {
      schema: {
        tags: ["prices"],
        summary: "Fetch current USD prices for one or more assets",
        querystring: {
          type: "object" as const,
          additionalProperties: true,
          required: ["assets"],
          properties: {
            assets: {
              type: "string" as const,
              minLength: 1,
              description: "Comma-separated tickers, e.g. BTC,ETH,SOL",
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
                  prices: {
                    type: "object" as const,
                    additionalProperties: true,
                  },
                  fetchedAt: { type: "string" as const, format: "date-time" },
                },
              },
            },
          },
          400: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const query = z
        .object({ assets: z.string().min(1) })
        .parse(request.query);

      const tickers = query.assets
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (tickers.length === 0) {
        return reply
          .status(400)
          .send({ error: { message: "No valid asset tickers provided" } });
      }

      if (tickers.length > 50) {
        return reply
          .status(400)
          .send({ error: { message: "Maximum 50 assets per request" } });
      }

      try {
        const prices = await fetchPrices(tickers);
        return { data: { prices, fetchedAt: new Date().toISOString() } };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Price fetch failed";
        return reply
          .status(502)
          .send({ error: { message, code: "PRICE_FETCH_ERROR" } });
      }
    },
  );

  // GET /prices/supported
  app.get(
    "/prices/supported",
    {
      schema: {
        tags: ["prices"],
        summary: "List all supported asset tickers",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  tickers: {
                    type: "array" as const,
                    items: { type: "string" as const },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      return { data: { tickers: getSupportedTickers() } };
    },
  );

  // GET /prices/exchange-rates
  app.get(
    "/prices/exchange-rates",
    {
      schema: {
        tags: ["prices"],
        summary:
          "Get USD-relative exchange rates for supported fiat currencies",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  rates: {
                    type: "object" as const,
                    additionalProperties: true,
                  },
                  baseCurrency: { type: "string" as const },
                },
              },
            },
          },
          502: errorSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const rates = await fetchExchangeRates();
        return { data: { rates, baseCurrency: "USD" } };
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Exchange rate fetch failed";
        return reply
          .status(502)
          .send({ error: { message, code: "EXCHANGE_RATE_ERROR" } });
      }
    },
  );

  // GET /prices/history?asset=BTC&date=2024-06-15
  app.get(
    "/prices/history",
    {
      schema: {
        tags: ["prices"],
        summary: "Fetch historical USD price for a single asset on a date",
        querystring: {
          type: "object" as const,
          additionalProperties: true,
          required: ["asset", "date"],
          properties: {
            asset: { type: "string" as const, minLength: 1 },
            date: {
              type: "string" as const,
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              description: "Date in YYYY-MM-DD format",
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
                  asset: { type: "string" as const },
                  date: { type: "string" as const },
                  priceUsd: { type: "number" as const, nullable: true },
                },
              },
            },
          },
          400: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          asset: z.string().min(1),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(request.query);

      const date = new Date(query.date + "T12:00:00Z");
      if (isNaN(date.getTime())) {
        return reply
          .status(400)
          .send({ error: { message: "Invalid date format" } });
      }

      try {
        const price = await fetchHistoricalPrice(query.asset, date);
        return {
          data: {
            asset: query.asset.toUpperCase(),
            date: query.date,
            priceUsd: price,
          },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Price fetch failed";
        return reply
          .status(502)
          .send({ error: { message, code: "PRICE_FETCH_ERROR" } });
      }
    },
  );

  // POST /prices/backfill
  app.post(
    "/prices/backfill",
    {
      schema: {
        tags: ["prices"],
        summary:
          "Backfill missing USD values for user transactions using historical prices",
        body: {
          type: "object" as const,
          additionalProperties: true,
          properties: {
            limit: {
              type: "integer" as const,
              minimum: 1,
              maximum: 100,
              default: 50,
            },
            dryRun: { type: "boolean" as const, default: false },
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
                  message: { type: "string" as const },
                  updated: { type: "integer" as const },
                  skipped: { type: "integer" as const },
                  total: { type: "integer" as const },
                  errors: {
                    type: "array" as const,
                    nullable: true,
                    items: { type: "string" as const },
                  },
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
          limit: z.number().int().min(1).max(100).default(50),
          dryRun: z.boolean().default(false),
        })
        .parse(request.body || {});

      const txsMissingValue = await prisma.transaction.findMany({
        where: {
          userId: request.userId,
          OR: [
            {
              receivedAsset: { not: null },
              receivedAmount: { not: null },
              receivedValueUsd: null,
            },
            {
              sentAsset: { not: null },
              sentAmount: { not: null },
              sentValueUsd: null,
            },
          ],
        },
        orderBy: { timestamp: "desc" },
        take: body.limit,
      });

      if (txsMissingValue.length === 0) {
        return {
          data: {
            message: "No transactions need price backfill",
            updated: 0,
            skipped: 0,
            total: 0,
          },
        };
      }

      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const tx of txsMissingValue) {
        try {
          const updates: Record<string, unknown> = {};

          if (tx.receivedAsset && tx.receivedAmount && !tx.receivedValueUsd) {
            const price = await fetchHistoricalPrice(
              tx.receivedAsset,
              tx.timestamp,
            );
            if (price !== null) {
              updates.receivedValueUsd = Number(tx.receivedAmount) * price;
            }
          }

          if (tx.sentAsset && tx.sentAmount && !tx.sentValueUsd) {
            const price = await fetchHistoricalPrice(
              tx.sentAsset,
              tx.timestamp,
            );
            if (price !== null) {
              updates.sentValueUsd = Number(tx.sentAmount) * price;
            }
          }

          if (Object.keys(updates).length === 0) {
            skipped++;
            continue;
          }

          if (!body.dryRun) {
            await prisma.transaction.update({
              where: { id: tx.id },
              data: updates,
            });
          }
          updated++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          if (msg.includes("rate limit")) {
            errors.push(`Rate limited after ${updated} updates`);
            break;
          }
          errors.push(`${tx.id.slice(0, 8)}: ${msg}`);
          skipped++;
        }
      }

      return {
        data: {
          message: body.dryRun
            ? `Dry run: ${updated} transactions would be updated`
            : `Backfilled ${updated} transactions`,
          updated,
          skipped,
          total: txsMissingValue.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    },
  );
}
