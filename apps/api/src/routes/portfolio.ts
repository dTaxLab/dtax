/**
 * Portfolio routes.
 * GET /portfolio/holdings — Aggregate holdings with optional TLH analysis
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { analyzeHoldings } from '@dtax/tax-engine';
import type { TaxLot, PriceMap } from '@dtax/tax-engine';

const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function portfolioRoutes(app: FastifyInstance) {

    // GET /portfolio/holdings
    app.get('/portfolio/holdings', async (request, reply) => {
        const query = z.object({
            prices: z.string().optional(),
        }).parse(request.query);

        // Parse prices from JSON string: {"BTC":45000,"ETH":2500}
        let currentPrices: PriceMap | undefined;
        if (query.prices) {
            try {
                const parsed = JSON.parse(query.prices) as Record<string, number>;
                currentPrices = new Map(Object.entries(parsed));
            } catch {
                return reply.status(400).send({
                    error: { message: 'Invalid prices format. Expected JSON: {"BTC":45000}' },
                });
            }
        }

        // Get all acquisition transactions (remaining lots)
        const acquisitions = await prisma.transaction.findMany({
            where: {
                userId: TEMP_USER_ID,
                type: { in: ['BUY', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'FORK', 'GIFT_RECEIVED'] },
            },
            orderBy: { timestamp: 'asc' },
        });

        // Get all dispositions to subtract consumed amounts
        const dispositions = await prisma.transaction.findMany({
            where: {
                userId: TEMP_USER_ID,
                type: { in: ['SELL', 'TRADE', 'GIFT_SENT', 'LOST', 'STOLEN'] },
            },
            orderBy: { timestamp: 'asc' },
        });

        // Build acquisition lots
        const rawLots: TaxLot[] = acquisitions.map((tx) => ({
            id: tx.id,
            asset: tx.receivedAsset || '',
            amount: Number(tx.receivedAmount || 0),
            costBasisUsd: Number(tx.receivedValueUsd || 0),
            acquiredAt: tx.timestamp,
            sourceId: tx.sourceId || 'unknown',
        }));

        // Build disposition totals per asset to approximate remaining amounts
        // This is a simplified approach — for accurate lot-level tracking,
        // we'd need to run the cost basis calculator to know which lots were consumed.
        // For now, subtract total dispositions from total acquisitions per asset.
        const disposedByAsset = new Map<string, number>();
        for (const tx of dispositions) {
            const asset = tx.sentAsset || '';
            const amount = Number(tx.sentAmount || 0);
            disposedByAsset.set(asset, (disposedByAsset.get(asset) || 0) + amount);
        }

        // Subtract disposed amounts from lots (FIFO order since lots sorted by timestamp)
        const remainingLots: TaxLot[] = [];
        const disposedRemaining = new Map(disposedByAsset);

        for (const lot of rawLots) {
            const disposed = disposedRemaining.get(lot.asset) || 0;
            if (disposed <= 0) {
                remainingLots.push(lot);
                continue;
            }

            if (disposed >= lot.amount) {
                // Lot fully consumed
                disposedRemaining.set(lot.asset, disposed - lot.amount);
                continue;
            }

            // Partially consumed
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
    });
}
