/**
 * Tax calculation routes.
 * POST /tax/calculate   — Run tax calculation for a given year + method
 * GET  /tax/summary     — Get tax summary for a year
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { CostBasisCalculator, generateForm8949, form8949ToCsv, generateScheduleD, detectWashSales, parse1099DA, reconcile } from '@dtax/tax-engine';
import type { TaxLot, TaxableEvent, LotDateMap, DtaxDisposition, AcquisitionRecord } from '@dtax/tax-engine';

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
                userId: request.userId,
                type: { in: ['BUY', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'FORK', 'GIFT_RECEIVED', 'DEX_SWAP', 'LP_WITHDRAWAL', 'LP_REWARD', 'NFT_MINT'] },
                timestamp: { lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        // 2. Get all SELL/TRADE dispositions in the tax year
        const dispositions = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: { in: ['SELL', 'TRADE', 'GIFT_SENT', 'LOST', 'STOLEN', 'DEX_SWAP', 'LP_DEPOSIT', 'NFT_PURCHASE', 'NFT_SALE'] },
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
                    userId: request.userId,
                    taxYear: body.taxYear,
                    method: body.method,
                },
            },
            create: {
                userId: request.userId,
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

    // GET /tax/form8949 — Generate Form 8949 report (JSON or CSV)
    app.get('/tax/form8949', async (request, reply) => {
        const query = z.object({
            year: z.coerce.number().int().min(2009).max(2030),
            method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
            format: z.enum(['json', 'csv']).default('json'),
            strictSilo: z.coerce.boolean().default(false),
            includeWashSales: z.coerce.boolean().default(false),
        }).parse(request.query);

        const yearStart = new Date(`${query.year}-01-01T00:00:00Z`);
        const yearEnd = new Date(`${query.year + 1}-01-01T00:00:00Z`);

        const acquisitions = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: { in: ['BUY', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'FORK', 'GIFT_RECEIVED', 'DEX_SWAP', 'LP_WITHDRAWAL', 'LP_REWARD', 'NFT_MINT'] },
                timestamp: { lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        const dispositions = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: { in: ['SELL', 'TRADE', 'GIFT_SENT', 'LOST', 'STOLEN', 'DEX_SWAP', 'LP_DEPOSIT', 'NFT_PURCHASE', 'NFT_SALE'] },
                timestamp: { gte: yearStart, lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        const lots: TaxLot[] = acquisitions.map((tx) => ({
            id: tx.id,
            asset: tx.receivedAsset || '',
            amount: Number(tx.receivedAmount || 0),
            costBasisUsd: Number(tx.receivedValueUsd || 0),
            acquiredAt: tx.timestamp,
            sourceId: tx.sourceId || 'unknown',
        }));

        const lotDates: LotDateMap = new Map(lots.map(l => [l.id, l.acquiredAt]));

        const events: TaxableEvent[] = dispositions.map((tx) => ({
            id: tx.id,
            asset: tx.sentAsset || '',
            amount: Number(tx.sentAmount || 0),
            proceedsUsd: Number(tx.sentValueUsd || 0),
            date: tx.timestamp,
            feeUsd: Number(tx.feeValueUsd || 0),
            sourceId: tx.sourceId || 'unknown',
        }));

        const calculator = new CostBasisCalculator(query.method);
        calculator.addLots(lots);
        const results = events.map(e => calculator.calculate(e, query.strictSilo));

        // Wash sale detection (optional)
        let washSaleAdjustments: Map<string, import('@dtax/tax-engine').WashSaleAdjustment> | undefined;
        let washSaleSummary;

        if (query.includeWashSales) {
            const acqRecords: AcquisitionRecord[] = lots.map(l => ({
                lotId: l.id,
                asset: l.asset,
                amount: l.amount,
                acquiredAt: l.acquiredAt,
            }));
            const consumedLotIds = new Set(results.flatMap(r => r.matchedLots.map(m => m.lotId)));
            const washResult = detectWashSales(results, acqRecords, consumedLotIds);
            washSaleAdjustments = new Map(washResult.adjustments.map(a => [a.lossEventId, a]));
            washSaleSummary = {
                totalDisallowed: washResult.totalDisallowed,
                adjustmentCount: washResult.adjustments.length,
            };
        }

        const report = generateForm8949(results, {
            taxYear: query.year,
            lotDates,
            reportingBasis: 'none',
            washSaleAdjustments,
        });

        if (query.format === 'csv') {
            const csv = form8949ToCsv(report);
            return reply
                .header('Content-Type', 'text/csv')
                .header('Content-Disposition', `attachment; filename="form8949-${query.year}-${query.method}.csv"`)
                .send(csv);
        }

        return { data: { ...report, washSaleSummary } };
    });

    // GET /tax/schedule-d — Generate Schedule D summary from Form 8949
    app.get('/tax/schedule-d', async (request, reply) => {
        const query = z.object({
            year: z.coerce.number().int().min(2009).max(2030),
            method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
            strictSilo: z.coerce.boolean().default(false),
            includeWashSales: z.coerce.boolean().default(false),
            lossLimit: z.coerce.number().default(3000),
        }).parse(request.query);

        const yearStart = new Date(`${query.year}-01-01T00:00:00Z`);
        const yearEnd = new Date(`${query.year + 1}-01-01T00:00:00Z`);

        const acquisitions = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: { in: ['BUY', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'FORK', 'GIFT_RECEIVED', 'DEX_SWAP', 'LP_WITHDRAWAL', 'LP_REWARD', 'NFT_MINT'] },
                timestamp: { lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        const dispositions = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: { in: ['SELL', 'TRADE', 'GIFT_SENT', 'LOST', 'STOLEN', 'DEX_SWAP', 'LP_DEPOSIT', 'NFT_PURCHASE', 'NFT_SALE'] },
                timestamp: { gte: yearStart, lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        const lots: TaxLot[] = acquisitions.map((tx) => ({
            id: tx.id,
            asset: tx.receivedAsset || '',
            amount: Number(tx.receivedAmount || 0),
            costBasisUsd: Number(tx.receivedValueUsd || 0),
            acquiredAt: tx.timestamp,
            sourceId: tx.sourceId || 'unknown',
        }));

        const lotDates: LotDateMap = new Map(lots.map(l => [l.id, l.acquiredAt]));

        const events: TaxableEvent[] = dispositions.map((tx) => ({
            id: tx.id,
            asset: tx.sentAsset || '',
            amount: Number(tx.sentAmount || 0),
            proceedsUsd: Number(tx.sentValueUsd || 0),
            date: tx.timestamp,
            feeUsd: Number(tx.feeValueUsd || 0),
            sourceId: tx.sourceId || 'unknown',
        }));

        const calculator = new CostBasisCalculator(query.method);
        calculator.addLots(lots);
        const results = events.map(e => calculator.calculate(e, query.strictSilo));

        // Optional wash sale detection
        let washSaleAdjustments: Map<string, import('@dtax/tax-engine').WashSaleAdjustment> | undefined;
        if (query.includeWashSales) {
            const acqRecords: AcquisitionRecord[] = lots.map(l => ({
                lotId: l.id, asset: l.asset, amount: l.amount, acquiredAt: l.acquiredAt,
            }));
            const consumedLotIds = new Set(results.flatMap(r => r.matchedLots.map(m => m.lotId)));
            const washResult = detectWashSales(results, acqRecords, consumedLotIds);
            washSaleAdjustments = new Map(washResult.adjustments.map(a => [a.lossEventId, a]));
        }

        const form8949 = generateForm8949(results, {
            taxYear: query.year,
            lotDates,
            reportingBasis: 'none',
            washSaleAdjustments,
        });

        const scheduleD = generateScheduleD(form8949, { lossLimit: query.lossLimit });

        return { data: scheduleD };
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
                    userId: request.userId,
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

    // POST /tax/reconcile — Upload 1099-DA CSV and reconcile against DTax calculations
    app.post('/tax/reconcile', async (request, reply) => {
        const body = z.object({
            csvContent: z.string().min(1),
            brokerName: z.string().default('Unknown'),
            taxYear: z.number().int().min(2009).max(2030),
            method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
        }).parse(request.body);

        // 1. Parse the 1099-DA CSV
        const parsed = parse1099DA(body.csvContent, body.brokerName, body.taxYear);

        if (parsed.entries.length === 0) {
            return reply.status(400).send({
                error: { message: 'No valid entries found in 1099-DA CSV', details: parsed.errors },
            });
        }

        // 2. Build DTax dispositions for the same tax year
        const yearStart = new Date(`${body.taxYear}-01-01T00:00:00Z`);
        const yearEnd = new Date(`${body.taxYear + 1}-01-01T00:00:00Z`);

        const acquisitions = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: { in: ['BUY', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'FORK', 'GIFT_RECEIVED', 'DEX_SWAP', 'LP_WITHDRAWAL', 'LP_REWARD', 'NFT_MINT'] },
                timestamp: { lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        const dispositions = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: { in: ['SELL', 'TRADE', 'GIFT_SENT', 'LOST', 'STOLEN', 'DEX_SWAP', 'LP_DEPOSIT', 'NFT_PURCHASE', 'NFT_SALE'] },
                timestamp: { gte: yearStart, lt: yearEnd },
            },
            orderBy: { timestamp: 'asc' },
        });

        // Get internal transfer IDs for misclassification detection
        const internalTransfers = await prisma.transaction.findMany({
            where: {
                userId: request.userId,
                type: 'INTERNAL_TRANSFER',
                timestamp: { gte: yearStart, lt: yearEnd },
            },
            select: { externalId: true },
        });
        const internalTransferIds = new Set(
            internalTransfers.map(t => t.externalId).filter((id): id is string => id !== null)
        );

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

        // 3. Calculate using the tax engine
        const calculator = new CostBasisCalculator(body.method);
        calculator.addLots(lots);
        const results = events.map(e => calculator.calculate(e));

        // 4. Convert to DtaxDisposition format
        const dtaxDispositions: DtaxDisposition[] = results.map(r => ({
            eventId: r.event.id,
            asset: r.event.asset,
            dateSold: r.event.date,
            proceeds: r.event.proceedsUsd,
            costBasis: r.matchedLots.reduce((s, l) => s + l.costBasisUsd, 0),
            gainLoss: r.gainLoss,
        }));

        // 5. Reconcile
        const report = reconcile(parsed.entries, dtaxDispositions, {
            taxYear: body.taxYear,
            brokerName: body.brokerName,
            internalTransferIds,
        });

        return {
            data: {
                ...report,
                parseErrors: parsed.errors,
            },
        };
    });
}
