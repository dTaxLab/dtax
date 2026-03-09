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
} from "../lib/prices";
import { prisma } from "../lib/prisma";

export async function priceRoutes(app: FastifyInstance) {
  // GET /prices?assets=BTC,ETH,SOL
  app.get("/prices", async (request, reply) => {
    const query = z
      .object({
        assets: z.string().min(1),
      })
      .parse(request.query);

    const tickers = query.assets
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (tickers.length === 0) {
      return reply.status(400).send({
        error: { message: "No valid asset tickers provided" },
      });
    }

    if (tickers.length > 50) {
      return reply.status(400).send({
        error: { message: "Maximum 50 assets per request" },
      });
    }

    try {
      const prices = await fetchPrices(tickers);
      return { data: { prices, fetchedAt: new Date().toISOString() } };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Price fetch failed";
      return reply.status(502).send({
        error: { message, code: "PRICE_FETCH_ERROR" },
      });
    }
  });

  // GET /prices/supported
  app.get("/prices/supported", async () => {
    return { data: { tickers: getSupportedTickers() } };
  });

  // GET /prices/history?asset=BTC&date=2024-06-15
  app.get("/prices/history", async (request, reply) => {
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
      return reply.status(502).send({
        error: { message, code: "PRICE_FETCH_ERROR" },
      });
    }
  });

  // POST /prices/backfill — Fill missing USD values for user's transactions
  app.post("/prices/backfill", async (request, _reply) => {
    const body = z
      .object({
        limit: z.number().int().min(1).max(100).default(50),
        dryRun: z.boolean().default(false),
      })
      .parse(request.body || {});

    // Find transactions missing USD values
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

        // Backfill received side
        if (tx.receivedAsset && tx.receivedAmount && !tx.receivedValueUsd) {
          const price = await fetchHistoricalPrice(
            tx.receivedAsset,
            tx.timestamp,
          );
          if (price !== null) {
            updates.receivedValueUsd = Number(tx.receivedAmount) * price;
          }
        }

        // Backfill sent side
        if (tx.sentAsset && tx.sentAmount && !tx.sentValueUsd) {
          const price = await fetchHistoricalPrice(tx.sentAsset, tx.timestamp);
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
  });
}
