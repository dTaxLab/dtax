/**
 * IRS Form 8949 Generator
 *
 * Converts CalculationResult[] into Form 8949 line items,
 * segregated by Box type (A-F) based on holding period and
 * 1099-B reporting status.
 *
 * Form 8949 columns:
 *   (a) Description of property (e.g., "2.5 BTC")
 *   (b) Date acquired (MM/DD/YYYY)
 *   (c) Date sold or disposed (MM/DD/YYYY)
 *   (d) Proceeds (sales price)
 *   (e) Cost or other basis
 *   (f) Adjustment code(s)
 *   (g) Amount of adjustment
 *   (h) Gain or (loss) = (d) - (e) + (g)
 *
 * @license AGPL-3.0
 */

import type { CalculationResult } from '../types';
import type { WashSaleAdjustment } from '../wash-sale';

/**
 * Form 8949 Box types.
 * A/B/C = short-term; D/E/F = long-term
 * A/D = reported on 1099-B with correct basis
 * B/E = reported on 1099-B with incorrect/no basis
 * C/F = not reported on 1099-B
 */
export type Form8949Box = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Single line item on Form 8949 */
export interface Form8949Line {
    /** (a) Description, e.g. "2.5 BTC" */
    description: string;
    /** (b) Date acquired (ISO string) */
    dateAcquired: string;
    /** (c) Date sold (ISO string) */
    dateSold: string;
    /** (d) Proceeds in USD */
    proceeds: number;
    /** (e) Cost basis in USD */
    costBasis: number;
    /** (f) Adjustment code (if any) */
    adjustmentCode: string;
    /** (g) Adjustment amount */
    adjustmentAmount: number;
    /** (h) Gain or loss = proceeds - costBasis + adjustmentAmount */
    gainLoss: number;
    /** Which box this line belongs to */
    box: Form8949Box;
    /** Holding period */
    holdingPeriod: 'SHORT_TERM' | 'LONG_TERM';
    /** Original event ID for traceability */
    eventId: string;
}

/** Summary totals for a single box */
export interface Form8949BoxSummary {
    box: Form8949Box;
    totalProceeds: number;
    totalCostBasis: number;
    totalAdjustments: number;
    totalGainLoss: number;
    lineCount: number;
}

/** Complete Form 8949 report */
export interface Form8949Report {
    taxYear: number;
    lines: Form8949Line[];
    boxSummaries: Form8949BoxSummary[];
    totals: {
        shortTermGainLoss: number;
        longTermGainLoss: number;
        totalGainLoss: number;
        totalProceeds: number;
        totalCostBasis: number;
        lineCount: number;
    };
}

/** Lot date lookup: maps lotId → acquiredAt date */
export type LotDateMap = Map<string, Date>;

export interface Form8949Options {
    /** Tax year for the report */
    taxYear: number;
    /** Lot acquisition dates for dateAcquired column. If not provided, uses 'VARIOUS'. */
    lotDates?: LotDateMap;
    /**
     * How to classify 1099-B reporting status.
     * 'none' = assume no 1099-B (Box C/F) — default for crypto
     * 'all_reported' = assume all reported (Box A/D)
     * 'custom' = use the provided classifyFn
     */
    reportingBasis?: 'none' | 'all_reported' | 'custom';
    /** Custom classifier for 1099-B reporting (used when reportingBasis='custom') */
    classifyFn?: (result: CalculationResult) => 'reported_correct' | 'reported_incorrect' | 'not_reported';
    /** Wash sale adjustments to apply (maps eventId → adjustment) */
    washSaleAdjustments?: Map<string, WashSaleAdjustment>;
}

function formatDate(date: Date): string {
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${m}/${d}/${y}`;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function determineBox(
    holdingPeriod: 'SHORT_TERM' | 'LONG_TERM',
    reportingStatus: 'reported_correct' | 'reported_incorrect' | 'not_reported',
): Form8949Box {
    if (holdingPeriod === 'SHORT_TERM') {
        if (reportingStatus === 'reported_correct') return 'A';
        if (reportingStatus === 'reported_incorrect') return 'B';
        return 'C';
    }
    if (reportingStatus === 'reported_correct') return 'D';
    if (reportingStatus === 'reported_incorrect') return 'E';
    return 'F';
}

/**
 * Generate a Form 8949 report from calculation results.
 */
export function generateForm8949(
    results: CalculationResult[],
    options: Form8949Options,
): Form8949Report {
    const { taxYear, lotDates, reportingBasis = 'none', classifyFn, washSaleAdjustments } = options;

    const lines: Form8949Line[] = [];

    for (const result of results) {
        const { event, matchedLots, gainLoss, holdingPeriod } = result;

        // Determine 1099-B reporting status
        let reportingStatus: 'reported_correct' | 'reported_incorrect' | 'not_reported';
        if (reportingBasis === 'all_reported') {
            reportingStatus = 'reported_correct';
        } else if (reportingBasis === 'custom' && classifyFn) {
            reportingStatus = classifyFn(result);
        } else {
            reportingStatus = 'not_reported';
        }

        const box = determineBox(holdingPeriod, reportingStatus);

        // Resolve acquisition date(s) from lot lookup
        let dateAcquired: string;
        if (lotDates && matchedLots.length > 0) {
            const uniqueDates = new Set(
                matchedLots.map(l => lotDates.get(l.lotId)).filter(Boolean).map(d => formatDate(d!))
            );
            if (uniqueDates.size === 1) {
                dateAcquired = [...uniqueDates][0];
            } else if (uniqueDates.size > 1) {
                dateAcquired = 'VARIOUS';
            } else {
                dateAcquired = 'VARIOUS';
            }
        } else {
            dateAcquired = 'VARIOUS';
        }

        // Total cost basis from matched lots
        const totalCostBasis = matchedLots.reduce((sum, l) => sum + l.costBasisUsd, 0);

        const feeUsd = event.feeUsd ?? 0;
        const washSale = washSaleAdjustments?.get(event.id);

        // Build adjustment code: E for fees, W for wash sale, or both
        let adjCode = '';
        let adjAmount = 0;
        if (feeUsd > 0 && washSale) {
            adjCode = 'E;W';
            adjAmount = round2(-feeUsd + washSale.disallowedLoss);
        } else if (washSale) {
            adjCode = 'W';
            adjAmount = round2(washSale.disallowedLoss);
        } else if (feeUsd > 0) {
            adjCode = 'E';
            adjAmount = round2(-feeUsd);
        }

        const adjustedGainLoss = washSale
            ? round2(gainLoss + washSale.disallowedLoss)
            : round2(gainLoss);

        lines.push({
            description: `${event.amount} ${event.asset}`,
            dateAcquired,
            dateSold: formatDate(event.date),
            proceeds: round2(event.proceedsUsd),
            costBasis: round2(totalCostBasis),
            adjustmentCode: adjCode,
            adjustmentAmount: adjAmount,
            gainLoss: adjustedGainLoss,
            box,
            holdingPeriod,
            eventId: event.id,
        });
    }

    // Build box summaries
    const boxMap = new Map<Form8949Box, Form8949Line[]>();
    for (const line of lines) {
        const existing = boxMap.get(line.box) || [];
        existing.push(line);
        boxMap.set(line.box, existing);
    }

    const boxSummaries: Form8949BoxSummary[] = [];
    for (const box of ['A', 'B', 'C', 'D', 'E', 'F'] as Form8949Box[]) {
        const boxLines = boxMap.get(box);
        if (!boxLines || boxLines.length === 0) continue;
        boxSummaries.push({
            box,
            totalProceeds: round2(boxLines.reduce((s, l) => s + l.proceeds, 0)),
            totalCostBasis: round2(boxLines.reduce((s, l) => s + l.costBasis, 0)),
            totalAdjustments: round2(boxLines.reduce((s, l) => s + l.adjustmentAmount, 0)),
            totalGainLoss: round2(boxLines.reduce((s, l) => s + l.gainLoss, 0)),
            lineCount: boxLines.length,
        });
    }

    // Overall totals
    const shortTermLines = lines.filter(l => l.holdingPeriod === 'SHORT_TERM');
    const longTermLines = lines.filter(l => l.holdingPeriod === 'LONG_TERM');

    return {
        taxYear,
        lines,
        boxSummaries,
        totals: {
            shortTermGainLoss: round2(shortTermLines.reduce((s, l) => s + l.gainLoss, 0)),
            longTermGainLoss: round2(longTermLines.reduce((s, l) => s + l.gainLoss, 0)),
            totalGainLoss: round2(lines.reduce((s, l) => s + l.gainLoss, 0)),
            totalProceeds: round2(lines.reduce((s, l) => s + l.proceeds, 0)),
            totalCostBasis: round2(lines.reduce((s, l) => s + l.costBasis, 0)),
            lineCount: lines.length,
        },
    };
}

/**
 * Export Form 8949 report as CSV string.
 * Suitable for TurboTax, H&R Block, and direct IRS filing.
 */
export function form8949ToCsv(report: Form8949Report): string {
    const header = [
        'Box',
        'Description of Property (a)',
        'Date Acquired (b)',
        'Date Sold (c)',
        'Proceeds (d)',
        'Cost Basis (e)',
        'Adjustment Code (f)',
        'Adjustment Amount (g)',
        'Gain or Loss (h)',
    ].join(',');

    const rows = report.lines.map(line => [
        line.box,
        `"${line.description}"`,
        line.dateAcquired,
        line.dateSold,
        line.proceeds.toFixed(2),
        line.costBasis.toFixed(2),
        line.adjustmentCode,
        line.adjustmentAmount !== 0 ? line.adjustmentAmount.toFixed(2) : '',
        line.gainLoss.toFixed(2),
    ].join(','));

    return [header, ...rows].join('\n');
}
