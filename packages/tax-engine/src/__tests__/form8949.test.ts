/**
 * Tests for Form 8949 report generation.
 */

import { describe, it, expect } from 'vitest';
import { CostBasisCalculator } from '../calculator';
import { generateForm8949, form8949ToCsv } from '../reports/form8949';
import type { TaxLot, TaxableEvent, CalculationResult, Form8949Report, LotDateMap } from '..';

function createTestLots(): TaxLot[] {
    return [
        {
            id: 'lot-1',
            asset: 'BTC',
            amount: 1.0,
            costBasisUsd: 30000,
            acquiredAt: new Date('2024-01-15'),
            sourceId: 'coinbase-1',
        },
        {
            id: 'lot-2',
            asset: 'BTC',
            amount: 0.5,
            costBasisUsd: 25000,
            acquiredAt: new Date('2023-06-01'),
            sourceId: 'binance-1',
        },
        {
            id: 'lot-3',
            asset: 'ETH',
            amount: 10,
            costBasisUsd: 20000,
            acquiredAt: new Date('2024-03-01'),
            sourceId: 'coinbase-1',
        },
    ];
}

function buildLotDateMap(lots: TaxLot[]): LotDateMap {
    const map = new Map<string, Date>();
    for (const lot of lots) {
        map.set(lot.id, lot.acquiredAt);
    }
    return map;
}

function runCalculations(lots: TaxLot[], events: TaxableEvent[]): CalculationResult[] {
    const calc = new CostBasisCalculator('FIFO');
    calc.addLots(lots);
    return events.map(e => calc.calculate(e));
}

describe('Form 8949 Generator', () => {
    it('should generate correct line items for short-term sales', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        // Sell 0.5 BTC on 2024-03-01 — FIFO picks lot-2 (2023-06-01, $50k/BTC)
        // but 2023-06-01 to 2024-03-01 < 1 year = SHORT_TERM
        const events: TaxableEvent[] = [
            {
                id: 'sale-1',
                asset: 'BTC',
                amount: 0.5,
                proceedsUsd: 22500,
                date: new Date('2024-03-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2024, lotDates });

        expect(report.lines).toHaveLength(1);
        const line = report.lines[0];
        expect(line.description).toBe('0.5 BTC');
        // FIFO: lot-2 (2023-06-01) consumed first
        expect(line.dateAcquired).toBe('06/01/2023');
        expect(line.dateSold).toBe('03/01/2024');
        expect(line.proceeds).toBe(22500);
        // lot-2: 0.5 BTC @ $25000 total
        expect(line.costBasis).toBe(25000);
        expect(line.gainLoss).toBe(-2500);
        expect(line.holdingPeriod).toBe('SHORT_TERM');
        // Default: not reported → Box C
        expect(line.box).toBe('C');
    });

    it('should generate correct line items for long-term sales', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        // lot-2 was acquired 2023-06-01, sell on 2025-01-15 = long-term
        const events: TaxableEvent[] = [
            {
                id: 'sale-lt',
                asset: 'BTC',
                amount: 1.0,
                proceedsUsd: 50000,
                date: new Date('2025-06-20'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2025, lotDates });

        expect(report.lines).toHaveLength(1);
        expect(report.lines[0].holdingPeriod).toBe('LONG_TERM');
        expect(report.lines[0].box).toBe('F'); // not reported + long-term
    });

    it('should segregate into correct boxes with all_reported option', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        const events: TaxableEvent[] = [
            {
                id: 'sale-st',
                asset: 'ETH',
                amount: 5,
                proceedsUsd: 15000,
                date: new Date('2024-08-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, {
            taxYear: 2024,
            lotDates,
            reportingBasis: 'all_reported',
        });

        expect(report.lines[0].box).toBe('A'); // reported_correct + short-term
    });

    it('should use VARIOUS for dateAcquired when multiple lots matched', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        // Sell 1.2 BTC: consumes lot-1 (1.0) + lot-2 (0.2) — two different dates
        const events: TaxableEvent[] = [
            {
                id: 'sale-multi',
                asset: 'BTC',
                amount: 1.2,
                proceedsUsd: 60000,
                date: new Date('2025-08-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2025, lotDates });

        expect(results[0].matchedLots).toHaveLength(2);
        expect(report.lines[0].dateAcquired).toBe('VARIOUS');
    });

    it('should handle fees with adjustment code E', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        const events: TaxableEvent[] = [
            {
                id: 'sale-fee',
                asset: 'ETH',
                amount: 2,
                proceedsUsd: 6000,
                date: new Date('2024-09-01'),
                sourceId: 'coinbase-1',
                feeUsd: 25,
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2024, lotDates });

        const line = report.lines[0];
        expect(line.adjustmentCode).toBe('E');
        expect(line.adjustmentAmount).toBe(-25);
        // gainLoss = proceeds - costBasis - fee = 6000 - 4000 - 25 = 1975
        expect(line.gainLoss).toBe(1975);
    });

    it('should compute box summaries correctly', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        // Both sales short-term: BTC sold 2024-03-15 (lot-2 acquired 2023-06-01 < 1yr),
        // ETH sold 2024-07-01 (lot-3 acquired 2024-03-01 < 1yr)
        const events: TaxableEvent[] = [
            {
                id: 'sale-1',
                asset: 'BTC',
                amount: 0.5,
                proceedsUsd: 22500,
                date: new Date('2024-03-15'),
                sourceId: 'coinbase-1',
            },
            {
                id: 'sale-2',
                asset: 'ETH',
                amount: 3,
                proceedsUsd: 5000,
                date: new Date('2024-07-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2024, lotDates });

        // Both short-term, not reported → Box C only
        expect(report.boxSummaries).toHaveLength(1);
        expect(report.boxSummaries[0].box).toBe('C');
        expect(report.boxSummaries[0].lineCount).toBe(2);
        expect(report.totals.lineCount).toBe(2);
    });

    it('should compute totals correctly', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        // Sell 0.3 BTC — FIFO picks lot-2 first (0.5 BTC at $50k/BTC)
        // costBasis = 0.3 * (25000/0.5) = 0.3 * 50000 = 15000
        const events: TaxableEvent[] = [
            {
                id: 'sale-1',
                asset: 'BTC',
                amount: 0.3,
                proceedsUsd: 12000,
                date: new Date('2024-03-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2024, lotDates });

        expect(report.totals.totalProceeds).toBe(12000);
        expect(report.totals.totalCostBasis).toBe(15000);
        expect(report.totals.totalGainLoss).toBe(-3000);
        expect(report.totals.shortTermGainLoss).toBe(-3000);
        expect(report.totals.longTermGainLoss).toBe(0);
    });

    it('should generate valid CSV output', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        const events: TaxableEvent[] = [
            {
                id: 'sale-csv',
                asset: 'BTC',
                amount: 0.1,
                proceedsUsd: 5000,
                date: new Date('2024-07-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2024, lotDates });
        const csv = form8949ToCsv(report);

        const lines = csv.split('\n');
        expect(lines).toHaveLength(2); // header + 1 data row
        expect(lines[0]).toContain('Description of Property');
        expect(lines[0]).toContain('Gain or Loss');

        const dataRow = lines[1];
        expect(dataRow).toContain('C'); // Box C
        expect(dataRow).toContain('"0.1 BTC"');
        expect(dataRow).toContain('5000.00');
    });

    it('should handle custom reportingBasis classifier', () => {
        const lots = createTestLots();
        const lotDates = buildLotDateMap(lots);

        const events: TaxableEvent[] = [
            {
                id: 'sale-custom',
                asset: 'ETH',
                amount: 1,
                proceedsUsd: 3000,
                date: new Date('2024-08-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, {
            taxYear: 2024,
            lotDates,
            reportingBasis: 'custom',
            classifyFn: () => 'reported_incorrect',
        });

        // short-term + reported_incorrect → Box B
        expect(report.lines[0].box).toBe('B');
    });

    it('should default to VARIOUS when no lotDates provided', () => {
        const lots = createTestLots();

        const events: TaxableEvent[] = [
            {
                id: 'sale-no-dates',
                asset: 'BTC',
                amount: 0.1,
                proceedsUsd: 5000,
                date: new Date('2024-07-01'),
                sourceId: 'coinbase-1',
            },
        ];

        const results = runCalculations(lots, events);
        const report = generateForm8949(results, { taxYear: 2024 });

        expect(report.lines[0].dateAcquired).toBe('VARIOUS');
    });
});
