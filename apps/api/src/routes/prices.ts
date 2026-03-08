/**
 * Price routes.
 * GET /prices          — Fetch current USD prices for assets
 * GET /prices/supported — List supported tickers
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fetchPrices, getSupportedTickers } from '../lib/prices';

export async function priceRoutes(app: FastifyInstance) {

    // GET /prices?assets=BTC,ETH,SOL
    app.get('/prices', async (request, reply) => {
        const query = z.object({
            assets: z.string().min(1),
        }).parse(request.query);

        const tickers = query.assets.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

        if (tickers.length === 0) {
            return reply.status(400).send({
                error: { message: 'No valid asset tickers provided' },
            });
        }

        if (tickers.length > 50) {
            return reply.status(400).send({
                error: { message: 'Maximum 50 assets per request' },
            });
        }

        try {
            const prices = await fetchPrices(tickers);
            return { data: { prices, fetchedAt: new Date().toISOString() } };
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Price fetch failed';
            return reply.status(502).send({
                error: { message, code: 'PRICE_FETCH_ERROR' },
            });
        }
    });

    // GET /prices/supported
    app.get('/prices/supported', async () => {
        return { data: { tickers: getSupportedTickers() } };
    });
}
