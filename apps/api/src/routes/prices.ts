/**
 * Price routes.
 * GET  /prices           — Fetch current USD prices for assets
 * GET  /prices/supported — List supported tickers
 * GET  /prices/history   — Fetch historical price for a single asset+date
 * POST /prices/backfill  — Backfill missing USD values for user's transactions
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import {
  fetchPrices,
  fetchHistoricalPrice,
  getSupportedTickers,
  fetchExchangeRates,
} from "../lib/prices";
import { prisma } from "../lib/prisma";
import { errorResponseSchema } from "../schemas/common";

const priceDataSchema = z
  .object({
    prices: z.record(z.string(), z.number()),
    fetchedAt: z.string().datetime(),
  })
  .openapi({ ref: "PriceData" });

const historicalPriceSchema = z
  .object({
    asset: z.string(),
    date: z.string(),
    priceUsd: z.number().nullable(),
  })
  .openapi({ ref: "HistoricalPrice" });

export async function priceRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // GET /prices?assets=BTC,ETH,SOL
  r.get(
    "/prices",
    {
      schema: {
        tags: ["prices"],
        operationId: "getPrices",
        description: "Fetch current USD prices for one or more assets",
        querystring: z.object({
          assets: z
            .string()
            .min(1)
            .openapi({
              description: "Comma-separated asset tickers, e.g. BTC,ETH,SOL",
            }),
        }),
        response: {
          200: z.object({
            data: priceDataSchema,
          }),
          400: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const query = request.query;

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
  r.get(
    "/prices/supported",
    {
      schema: {
        tags: ["prices"],
        operationId: "getSupportedTickers",
        description: "List supported asset tickers",
        response: {
          200: z.object({
            data: z.object({ tickers: z.array(z.string()) }),
          }),
        },
      },
    },
    async () => {
      return { data: { tickers: getSupportedTickers() } };
    },
  );

  // GET /prices/exchange-rates
  r.get(
    "/prices/exchange-rates",
    {
      schema: {
        tags: ["prices"],
        operationId: "getExchangeRates",
        description:
          "USD-relative exchange rates for supported fiat currencies",
        response: {
          200: z.object({
            data: z.object({
              rates: z.record(z.string(), z.number()),
              baseCurrency: z.literal("USD"),
            }),
          }),
          502: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const rates = await fetchExchangeRates();
        return { data: { rates, baseCurrency: "USD" as const } };
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Exchange rate fetch failed";
        return reply.status(502).send({
          error: { message, code: "EXCHANGE_RATE_ERROR" },
        });
      }
    },
  );

  // GET /prices/history?asset=BTC&date=2024-06-15
  r.get(
    "/prices/history",
    {
      schema: {
        tags: ["prices"],
        operationId: "getHistoricalPrice",
        description:
          "Fetch historical price for a single asset on a specific date",
        querystring: z.object({
          asset: z.string().min(1),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .openapi({ description: "Date in YYYY-MM-DD format" }),
        }),
        response: {
          200: z.object({
            data: historicalPriceSchema,
          }),
          400: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const query = request.query;

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
  r.post(
    "/prices/backfill",
    {
      schema: {
        tags: ["prices"],
        operationId: "backfillPrices",
        description:
          "Backfill missing USD values for user's transactions using historical prices",
        body: z.object({
          limit: z.number().int().min(1).max(100).default(50),
          dryRun: z.boolean().default(false),
        }),
        response: {
          200: z.object({
            data: z.object({
              message: z.string(),
              updated: z.number().int(),
              skipped: z.number().int(),
              total: z.number().int(),
              errors: z.array(z.string()).optional(),
            }),
          }),
        },
      },
    },
    async (request, _reply) => {
      const body = request.body;

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
