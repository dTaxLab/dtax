/**
 * Tax calculation routes.
 * POST /tax/calculate   — Run tax calculation for a given year + method
 * GET  /tax/form8949    — Generate Form 8949 report (JSON or CSV)
 * GET  /tax/schedule-d  — Generate Schedule D summary
 * GET  /tax/summary     — Get saved tax summary for a year
 * POST /tax/reconcile   — Reconcile 1099-DA against DTax calculations
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { fetchTaxData, calculateIncome, fetchInternalTransferIds } from '../lib/tax-data';
import {
    CostBasisCalculator, generateForm8949, form8949ToCsv, generateForm8949Pdf,
    generateScheduleD, detectWashSales, parse1099DA, reconcile,
} from '@dtax/tax-engine';
import type { LotDateMap, DtaxDisposition, AcquisitionRecord } from '@dtax/tax-engine';

const calculateSchema = z.object({
    taxYear: z.number().int().min(2009).max(2030),
    method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
    strictSilo: z.boolean().default(false),
});

/** Build wash sale adjustments map from lots + results */
function buildWashSaleAdjustments(lots: { id: string; asset: string; amount: number; acquiredAt: Date }[], results: ReturnType<CostBasisCalculator['calculate']>[]) {
    const acqRecords: AcquisitionRecord[] = lots.map(l => ({
        lotId: l.id, asset: l.asset, amount: l.amount, acquiredAt: l.acquiredAt,
    }));
    const consumedLotIds = new Set(results.flatMap(r => r.matchedLots.map(m => m.lotId)));
    const washResult = detectWashSales(results, acqRecords, consumedLotIds);
    return {
        adjustments: new Map(washResult.adjustments.map(a => [a.lossEventId, a])),
        summary: { totalDisallowed: washResult.totalDisallowed, adjustmentCount: washResult.adjustments.length },
    };
}

export async function taxRoutes(app: FastifyInstance) {

    // POST /tax/calculate — Run tax calculation
    app.post('/tax/calculate', async (request, reply) => {
        const body = calculateSchema.parse(request.body);
        const { lots, events } = await fetchTaxData({ userId: request.userId, taxYear: body.taxYear });
        const income = await calculateIncome({ userId: request.userId, taxYear: body.taxYear });

        const calculator = new CostBasisCalculator(body.method);
        calculator.addLots(lots);

        let shortTermGains = 0, shortTermLosses = 0, longTermGains = 0, longTermLosses = 0;
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

        const report = await prisma.taxReport.upsert({
            where: {
                userId_taxYear_method: { userId: request.userId, taxYear: body.taxYear, method: body.method },
            },
            create: {
                userId: request.userId, taxYear: body.taxYear, method: body.method,
                shortTermGains, shortTermLosses, longTermGains, longTermLosses,
                totalIncome: income.total, totalTransactions: events.length,
                reportData: JSON.parse(JSON.stringify({ results, income })),
                status: 'COMPLETE',
            },
            update: {
                shortTermGains, shortTermLosses, longTermGains, longTermLosses,
                totalIncome: income.total, totalTransactions: events.length,
                reportData: JSON.parse(JSON.stringify({ results, income })),
                status: 'COMPLETE',
            },
        });

        return reply.status(200).send({
            data: {
                report: {
                    id: report.id, taxYear: report.taxYear, method: report.method,
                    shortTermGains, shortTermLosses, longTermGains, longTermLosses,
                    netGainLoss: (shortTermGains - shortTermLosses) + (longTermGains - longTermLosses),
                    totalTransactions: events.length,
                    income,
                },
            },
        });
    });

    // GET /tax/form8949 — Generate Form 8949 report (JSON or CSV)
    app.get('/tax/form8949', async (request, reply) => {
        const query = z.object({
            year: z.coerce.number().int().min(2009).max(2030),
            method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
            format: z.enum(['json', 'csv', 'pdf']).default('json'),
            strictSilo: z.coerce.boolean().default(false),
            includeWashSales: z.coerce.boolean().default(false),
        }).parse(request.query);

        const { lots, events } = await fetchTaxData({ userId: request.userId, taxYear: query.year });
        const lotDates: LotDateMap = new Map(lots.map(l => [l.id, l.acquiredAt]));

        const calculator = new CostBasisCalculator(query.method);
        calculator.addLots(lots);
        const results = events.map(e => calculator.calculate(e, query.strictSilo));

        let washSaleAdjustments: Map<string, import('@dtax/tax-engine').WashSaleAdjustment> | undefined;
        let washSaleSummary;
        if (query.includeWashSales) {
            const ws = buildWashSaleAdjustments(lots, results);
            washSaleAdjustments = ws.adjustments;
            washSaleSummary = ws.summary;
        }

        const report = generateForm8949(results, { taxYear: query.year, lotDates, reportingBasis: 'none', washSaleAdjustments });

        if (query.format === 'csv') {
            const csv = form8949ToCsv(report);
            return reply
                .header('Content-Type', 'text/csv')
                .header('Content-Disposition', `attachment; filename="form8949-${query.year}-${query.method}.csv"`)
                .send(csv);
        }

        if (query.format === 'pdf') {
            const scheduleD = generateScheduleD(report);
            const pdfBuffer = await generateForm8949Pdf(report, { scheduleD });
            return reply
                .header('Content-Type', 'application/pdf')
                .header('Content-Disposition', `attachment; filename="form8949-${query.year}-${query.method}.pdf"`)
                .send(pdfBuffer);
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

        const { lots, events } = await fetchTaxData({ userId: request.userId, taxYear: query.year });
        const lotDates: LotDateMap = new Map(lots.map(l => [l.id, l.acquiredAt]));

        const calculator = new CostBasisCalculator(query.method);
        calculator.addLots(lots);
        const results = events.map(e => calculator.calculate(e, query.strictSilo));

        let washSaleAdjustments: Map<string, import('@dtax/tax-engine').WashSaleAdjustment> | undefined;
        if (query.includeWashSales) {
            washSaleAdjustments = buildWashSaleAdjustments(lots, results).adjustments;
        }

        const form8949 = generateForm8949(results, { taxYear: query.year, lotDates, reportingBasis: 'none', washSaleAdjustments });
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
                userId_taxYear_method: { userId: request.userId, taxYear: query.year, method: query.method },
            },
        });

        if (!report) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: `No tax report found for ${query.year} using ${query.method}. Run POST /tax/calculate first.` },
            });
        }

        return {
            data: {
                taxYear: report.taxYear, method: report.method,
                shortTermGains: Number(report.shortTermGains), shortTermLosses: Number(report.shortTermLosses),
                longTermGains: Number(report.longTermGains), longTermLosses: Number(report.longTermLosses),
                netGainLoss: Number(report.shortTermGains) - Number(report.shortTermLosses) + Number(report.longTermGains) - Number(report.longTermLosses),
                totalIncome: Number(report.totalIncome),
                totalTransactions: report.totalTransactions,
                status: report.status, updatedAt: report.updatedAt,
            },
        };
    });

    // POST /tax/reconcile — Upload 1099-DA CSV and reconcile
    app.post('/tax/reconcile', async (request, reply) => {
        const body = z.object({
            csvContent: z.string().min(1),
            brokerName: z.string().default('Unknown'),
            taxYear: z.number().int().min(2009).max(2030),
            method: z.enum(['FIFO', 'LIFO', 'HIFO']).default('FIFO'),
        }).parse(request.body);

        const parsed = parse1099DA(body.csvContent, body.brokerName, body.taxYear);
        if (parsed.entries.length === 0) {
            return reply.status(400).send({
                error: { message: 'No valid entries found in 1099-DA CSV', details: parsed.errors },
            });
        }

        const { lots, events, yearStart, yearEnd } = await fetchTaxData({ userId: request.userId, taxYear: body.taxYear });
        const internalTransferIds = await fetchInternalTransferIds(request.userId, yearStart, yearEnd);

        const calculator = new CostBasisCalculator(body.method);
        calculator.addLots(lots);
        const results = events.map(e => calculator.calculate(e));

        const dtaxDispositions: DtaxDisposition[] = results.map(r => ({
            eventId: r.event.id, asset: r.event.asset, dateSold: r.event.date,
            proceeds: r.event.proceedsUsd,
            costBasis: r.matchedLots.reduce((s, l) => s + l.costBasisUsd, 0),
            gainLoss: r.gainLoss,
        }));

        const report = reconcile(parsed.entries, dtaxDispositions, {
            taxYear: body.taxYear, brokerName: body.brokerName, internalTransferIds,
        });

        return { data: { ...report, parseErrors: parsed.errors } };
    });
}
