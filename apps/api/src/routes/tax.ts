/**
 * Tax calculation routes.
 * POST /tax/calculate   — Run tax calculation for a given year + method
 * GET  /tax/summary     — Get tax summary for a year
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { CostBasisCalculator } from '@dtax/tax-engine';
import type { TaxLot, TaxableEvent } from '@dtax/tax-engine';

const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';

const calculateSchema = z.object({
    taxYear: z.number().int().min(2009).max(2030),
    method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
    strictSilo: z.boolean().default(false),
});

export async function taxRoutes(app: FastifyInstance) {

    // POST /tax/calculate — Run tax calculation
    app.post('/tax/calculate', async (request, reply) => {
        const body = calculateSchema.parse(request.body);
        const yearStart = new Date(`${body.taxYear}-01-01T00:00:00Z`);
        const yearEnd = new Date(`${body.taxYear + 1}-01-01T00:00:00Z`);

        // 1. Get all BUY/AIRDROP/etc transactions to build tax lots
        const acquisitions = await prisma.transaction.findMany({
            where: {
                userId: TEMP_USER_ID,
                type: { in: ['BUY', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'FORK', 'GIFT_RECEIVED'] },
                timestamp: { lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        // 2. Get all SELL/TRADE dispositions in the tax year
        const dispositions = await prisma.transaction.findMany({
            where: {
                userId: TEMP_USER_ID,
                type: { in: ['SELL', 'TRADE', 'GIFT_SENT', 'LOST', 'STOLEN'] },
                timestamp: { gte: yearStart, lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        // 3. Convert to tax-engine format
        const lots: TaxLot[] = acquisitions.map((tx) => ({
            id: tx.id,
            asset: tx.receivedAsset || '',
            amount: Number(tx.receivedAmount || 0),
            costBasisUsd: Number(tx.receivedValueUsd || 0),
            acquiredAt: tx.timestamp,
            sourceId: tx.sourceId || 'unknown',
        }));

        const events: TaxableEvent[] = dispositions.map((tx) => ({
            id: tx.id,
            asset: tx.sentAsset || '',
            amount: Number(tx.sentAmount || 0),
            proceedsUsd: Number(tx.sentValueUsd || 0),
            date: tx.timestamp,
            feeUsd: Number(tx.feeValueUsd || 0),
            sourceId: tx.sourceId || 'unknown',
        }));

        // 4. Calculate using the tax engine
        const calculator = new CostBasisCalculator(body.method);
        calculator.addLots(lots);

        let shortTermGains = 0;
        let shortTermLosses = 0;
        let longTermGains = 0;
        let longTermLosses = 0;
        const results = [];

        for (const event of events) {
            const result = calculator.calculate(event, body.strictSilo);
            results.push(result);

            if (result.holdingPeriod === 'SHORT_TERM') {
                if (result.gainLoss >= 0) shortTermGains += result.gainLoss;
                else shortTermLosses += Math.abs(result.gainLoss);
            } else {
                if (result.gainLoss >= 0) longTermGains += result.gainLoss;
                else longTermLosses += Math.abs(result.gainLoss);
            }
        }

        // 5. Save report
        const report = await prisma.taxReport.upsert({
            where: {
                userId_taxYear_method: {
                    userId: TEMP_USER_ID,
                    taxYear: body.taxYear,
                    method: body.method,
                },
            },
            create: {
                userId: TEMP_USER_ID,
                taxYear: body.taxYear,
                method: body.method,
                shortTermGains,
                shortTermLosses,
                longTermGains,
                longTermLosses,
                totalTransactions: events.length,
                reportData: JSON.parse(JSON.stringify(results)),
                status: 'COMPLETE',
            },
            update: {
                shortTermGains,
                shortTermLosses,
                longTermGains,
                longTermLosses,
                totalTransactions: events.length,
                reportData: JSON.parse(JSON.stringify(results)),
                status: 'COMPLETE',
            },
        });

        return reply.status(200).send({
            data: {
                report: {
                    id: report.id,
                    taxYear: report.taxYear,
                    method: report.method,
                    shortTermGains,
                    shortTermLosses,
                    longTermGains,
                    longTermLosses,
                    netGainLoss: (shortTermGains - shortTermLosses) + (longTermGains - longTermLosses),
                    totalTransactions: events.length,
                },
            },
        });
    });

    // GET /tax/summary — Get tax summary for a year
    app.get('/tax/summary', async (request, reply) => {
        const query = z.object({
            year: z.coerce.number().int().min(2009).max(2030),
            method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
        }).parse(request.query);

        const report = await prisma.taxReport.findUnique({
            where: {
                userId_taxYear_method: {
                    userId: TEMP_USER_ID,
                    taxYear: query.year,
                    method: query.method,
                },
            },
        });

        if (!report) {
            return reply.status(404).send({
                error: {
                    code: 'NOT_FOUND',
                    message: `No tax report found for ${query.year} using ${query.method}. Run POST /tax/calculate first.`,
                },
            });
        }

        return {
            data: {
                taxYear: report.taxYear,
                method: report.method,
                shortTermGains: Number(report.shortTermGains),
                shortTermLosses: Number(report.shortTermLosses),
                longTermGains: Number(report.longTermGains),
                longTermLosses: Number(report.longTermLosses),
                netGainLoss:
                    Number(report.shortTermGains) - Number(report.shortTermLosses) +
                    Number(report.longTermGains) - Number(report.longTermLosses),
                totalTransactions: report.totalTransactions,
                status: report.status,
                updatedAt: report.updatedAt,
            },
        };
    });
}
