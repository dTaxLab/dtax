/**
 * Schedule D (Form 1040) Generator Tests
 *
 * Validates correct aggregation of Form 8949 box summaries
 * into Schedule D lines, net gain/loss calculation, and
 * $3,000 capital loss deduction limit.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import { CostBasisCalculator } from '../calculator';
import { generateForm8949 } from '../reports/form8949';
import { generateScheduleD } from '../reports/schedule-d';
import type { TaxLot, TaxableEvent, LotDateMap } from '../types';

describe('Schedule D Generator', () => {

    /** Helper: create a simple Form 8949 report from lots and events */
    function buildForm8949(
        lots: TaxLot[],
        events: TaxableEvent[],
        reportingBasis: 'none' | 'all_reported' = 'none',
    ) {
        const calc = new CostBasisCalculator('FIFO');
        calc.addLots(lots);
        const results = events.map(e => calc.calculate(e));
        const lotDates: LotDateMap = new Map(lots.map(l => [l.id, l.acquiredAt]));
        return generateForm8949(results, { taxYear: 2025, lotDates, reportingBasis });
    }

    // ─── Net gains scenario ─────────

    describe('net gains', () => {
        it('should calculate short-term and long-term gains correctly', () => {
            const lots: TaxLot[] = [
                { id: 'st-lot', asset: 'BTC', amount: 1, costBasisUsd: 40000, acquiredAt: new Date('2025-01-01'), sourceId: 'w1' },
                { id: 'lt-lot', asset: 'ETH', amount: 10, costBasisUsd: 20000, acquiredAt: new Date('2023-06-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 'st-sell', asset: 'BTC', amount: 1, proceedsUsd: 55000, date: new Date('2025-06-01'), sourceId: 'w1' },
                { id: 'lt-sell', asset: 'ETH', amount: 10, proceedsUsd: 35000, date: new Date('2025-06-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events);
            const scheduleD = generateScheduleD(form8949);

            expect(scheduleD.taxYear).toBe(2025);
            expect(scheduleD.netShortTerm).toBe(15000);  // 55000 - 40000
            expect(scheduleD.netLongTerm).toBe(15000);    // 35000 - 20000
            expect(scheduleD.combinedNetGainLoss).toBe(30000);
            expect(scheduleD.capitalLossDeduction).toBe(0);
            expect(scheduleD.carryoverLoss).toBe(0);
        });
    });

    // ─── Net losses with $3,000 limit ─────────

    describe('capital loss deduction limit', () => {
        it('should cap capital loss deduction at $3,000', () => {
            const lots: TaxLot[] = [
                { id: 'lot-1', asset: 'BTC', amount: 1, costBasisUsd: 60000, acquiredAt: new Date('2025-01-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 'sell-1', asset: 'BTC', amount: 1, proceedsUsd: 40000, date: new Date('2025-06-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events);
            const scheduleD = generateScheduleD(form8949);

            expect(scheduleD.netShortTerm).toBe(-20000);
            expect(scheduleD.combinedNetGainLoss).toBe(-20000);
            expect(scheduleD.capitalLossDeduction).toBe(3000);
            expect(scheduleD.carryoverLoss).toBe(17000);
        });

        it('should allow full deduction if loss is under $3,000', () => {
            const lots: TaxLot[] = [
                { id: 'lot-1', asset: 'ETH', amount: 1, costBasisUsd: 3500, acquiredAt: new Date('2024-01-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 'sell-1', asset: 'ETH', amount: 1, proceedsUsd: 2000, date: new Date('2025-06-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events);
            const scheduleD = generateScheduleD(form8949);

            expect(scheduleD.netLongTerm).toBe(-1500);
            expect(scheduleD.capitalLossDeduction).toBe(1500);
            expect(scheduleD.carryoverLoss).toBe(0);
        });

        it('should support custom loss limit (e.g., $1,500 for MFS filers)', () => {
            const lots: TaxLot[] = [
                { id: 'lot-1', asset: 'BTC', amount: 1, costBasisUsd: 50000, acquiredAt: new Date('2025-01-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 'sell-1', asset: 'BTC', amount: 1, proceedsUsd: 40000, date: new Date('2025-06-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events);
            const scheduleD = generateScheduleD(form8949, { lossLimit: 1500 });

            expect(scheduleD.capitalLossDeduction).toBe(1500);
            expect(scheduleD.carryoverLoss).toBe(8500);
        });
    });

    // ─── Mixed gains and losses ─────────

    describe('mixed gains and losses', () => {
        it('should net short-term losses against long-term gains', () => {
            const lots: TaxLot[] = [
                { id: 'st-lot', asset: 'BTC', amount: 1, costBasisUsd: 50000, acquiredAt: new Date('2025-01-01'), sourceId: 'w1' },
                { id: 'lt-lot', asset: 'ETH', amount: 10, costBasisUsd: 10000, acquiredAt: new Date('2023-01-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 'st-loss', asset: 'BTC', amount: 1, proceedsUsd: 42000, date: new Date('2025-06-01'), sourceId: 'w1' },
                { id: 'lt-gain', asset: 'ETH', amount: 10, proceedsUsd: 25000, date: new Date('2025-06-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events);
            const scheduleD = generateScheduleD(form8949);

            expect(scheduleD.netShortTerm).toBe(-8000);   // 42000 - 50000
            expect(scheduleD.netLongTerm).toBe(15000);     // 25000 - 10000
            expect(scheduleD.combinedNetGainLoss).toBe(7000); // Net positive
            expect(scheduleD.capitalLossDeduction).toBe(0);   // No deduction (net positive)
        });
    });

    // ─── Box classification ─────────

    describe('box classification', () => {
        it('should route to Box C/F when reportingBasis is none (crypto default)', () => {
            const lots: TaxLot[] = [
                { id: 'st', asset: 'BTC', amount: 1, costBasisUsd: 30000, acquiredAt: new Date('2025-01-01'), sourceId: 'w1' },
                { id: 'lt', asset: 'ETH', amount: 5, costBasisUsd: 5000, acquiredAt: new Date('2023-01-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 's1', asset: 'BTC', amount: 1, proceedsUsd: 35000, date: new Date('2025-03-01'), sourceId: 'w1' },
                { id: 's2', asset: 'ETH', amount: 5, proceedsUsd: 10000, date: new Date('2025-03-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events, 'none');
            const scheduleD = generateScheduleD(form8949);

            // Box C = short-term not reported, Box F = long-term not reported
            expect(scheduleD.partI[2].gainLoss).toBe(5000);   // Line 3 (Box C)
            expect(scheduleD.partII[2].gainLoss).toBe(5000);  // Line 10 (Box F)
            // Lines 1a and 2 should be zero
            expect(scheduleD.partI[0].gainLoss).toBe(0);
            expect(scheduleD.partI[1].gainLoss).toBe(0);
        });

        it('should route to Box A/D when reportingBasis is all_reported', () => {
            const lots: TaxLot[] = [
                { id: 'st', asset: 'BTC', amount: 1, costBasisUsd: 30000, acquiredAt: new Date('2025-01-01'), sourceId: 'w1' },
                { id: 'lt', asset: 'ETH', amount: 5, costBasisUsd: 5000, acquiredAt: new Date('2023-01-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 's1', asset: 'BTC', amount: 1, proceedsUsd: 35000, date: new Date('2025-03-01'), sourceId: 'w1' },
                { id: 's2', asset: 'ETH', amount: 5, proceedsUsd: 10000, date: new Date('2025-03-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events, 'all_reported');
            const scheduleD = generateScheduleD(form8949);

            // Box A = short-term reported, Box D = long-term reported
            expect(scheduleD.partI[0].gainLoss).toBe(5000);   // Line 1a (Box A)
            expect(scheduleD.partII[0].gainLoss).toBe(5000);  // Line 8a (Box D)
        });
    });

    // ─── Edge cases ─────────

    describe('edge cases', () => {
        it('should handle zero transactions', () => {
            const form8949 = buildForm8949([], []);
            const scheduleD = generateScheduleD(form8949);

            expect(scheduleD.netShortTerm).toBe(0);
            expect(scheduleD.netLongTerm).toBe(0);
            expect(scheduleD.combinedNetGainLoss).toBe(0);
            expect(scheduleD.capitalLossDeduction).toBe(0);
            expect(scheduleD.carryoverLoss).toBe(0);
        });

        it('should handle exact $3,000 loss', () => {
            const lots: TaxLot[] = [
                { id: 'lot-1', asset: 'BTC', amount: 1, costBasisUsd: 33000, acquiredAt: new Date('2025-01-01'), sourceId: 'w1' },
            ];
            const events: TaxableEvent[] = [
                { id: 'sell-1', asset: 'BTC', amount: 1, proceedsUsd: 30000, date: new Date('2025-06-01'), sourceId: 'w1' },
            ];

            const form8949 = buildForm8949(lots, events);
            const scheduleD = generateScheduleD(form8949);

            expect(scheduleD.combinedNetGainLoss).toBe(-3000);
            expect(scheduleD.capitalLossDeduction).toBe(3000);
            expect(scheduleD.carryoverLoss).toBe(0);
        });
    });
});
