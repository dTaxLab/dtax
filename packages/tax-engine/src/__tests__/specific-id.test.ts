import { describe, it, expect } from 'vitest';
import { calculateSpecificId } from '../methods/specific-id';
import type { TaxLot, TaxableEvent, LotSelection } from '../types';

function makeLot(id: string, amount: number, costBasisUsd: number, acquiredAt: string): TaxLot {
    return { id, asset: 'BTC', amount, costBasisUsd, acquiredAt: new Date(acquiredAt), sourceId: 's1' };
}

function makeEvent(amount: number, proceedsUsd: number, date: string): TaxableEvent {
    return { id: 'e1', asset: 'BTC', amount, proceedsUsd, date: new Date(date), sourceId: 's1' };
}

describe('Specific ID', () => {
    it('should use the specified lot', () => {
        const lots = [
            makeLot('lot1', 1, 10000, '2024-01-01'),
            makeLot('lot2', 1, 50000, '2024-06-01'),
        ];
        const event = makeEvent(1, 40000, '2025-07-01');
        const selections: LotSelection[] = [{ lotId: 'lot2', amount: 1 }];

        const result = calculateSpecificId(lots, event, selections);
        expect(result.gainLoss).toBe(-10000); // 40000 - 50000
        expect(result.matchedLots).toHaveLength(1);
        expect(result.matchedLots[0].lotId).toBe('lot2');
        expect(result.method).toBe('SPECIFIC_ID');
    });

    it('should support selecting from multiple lots', () => {
        const lots = [
            makeLot('lot1', 2, 20000, '2024-01-01'),
            makeLot('lot2', 1, 60000, '2024-06-01'),
        ];
        const event = makeEvent(1.5, 75000, '2025-07-01');
        const selections: LotSelection[] = [
            { lotId: 'lot1', amount: 0.5 },
            { lotId: 'lot2', amount: 1 },
        ];

        const result = calculateSpecificId(lots, event, selections);
        // cost: 0.5 * 10000 + 1 * 60000 = 5000 + 60000 = 65000
        expect(result.gainLoss).toBe(10000);
        expect(result.matchedLots).toHaveLength(2);
    });

    it('should mutate lots in place', () => {
        const lots = [makeLot('lot1', 2, 20000, '2024-01-01')];
        const event = makeEvent(1, 15000, '2025-01-01');
        const selections: LotSelection[] = [{ lotId: 'lot1', amount: 1 }];

        calculateSpecificId(lots, event, selections);
        expect(lots[0].amount).toBeCloseTo(1);
        expect(lots[0].costBasisUsd).toBeCloseTo(10000);
    });

    it('should throw if lot not found', () => {
        const lots = [makeLot('lot1', 1, 10000, '2024-01-01')];
        const event = makeEvent(1, 15000, '2025-01-01');
        const selections: LotSelection[] = [{ lotId: 'lot99', amount: 1 }];

        expect(() => calculateSpecificId(lots, event, selections)).toThrow('Lot lot99 not found');
    });

    it('should throw if selected amount exceeds lot balance', () => {
        const lots = [makeLot('lot1', 0.5, 5000, '2024-01-01')];
        const event = makeEvent(1, 15000, '2025-01-01');
        const selections: LotSelection[] = [{ lotId: 'lot1', amount: 1 }];

        expect(() => calculateSpecificId(lots, event, selections)).toThrow('has 0.5 available');
    });

    it('should throw if selected total does not match event amount', () => {
        const lots = [makeLot('lot1', 2, 20000, '2024-01-01')];
        const event = makeEvent(1, 15000, '2025-01-01');
        const selections: LotSelection[] = [{ lotId: 'lot1', amount: 0.5 }];

        expect(() => calculateSpecificId(lots, event, selections)).toThrow('does not match event amount');
    });

    it('should throw if lot asset does not match event asset', () => {
        const lots: TaxLot[] = [{ id: 'lot1', asset: 'ETH', amount: 1, costBasisUsd: 3000, acquiredAt: new Date('2024-01-01'), sourceId: 's1' }];
        const event = makeEvent(1, 15000, '2025-01-01');
        const selections: LotSelection[] = [{ lotId: 'lot1', amount: 1 }];

        expect(() => calculateSpecificId(lots, event, selections)).toThrow('does not match event asset');
    });

    it('should determine holding period from earliest selected lot', () => {
        const lots = [
            makeLot('lot1', 1, 10000, '2024-01-01'), // > 1 year → LONG_TERM
            makeLot('lot2', 1, 50000, '2025-06-01'), // < 1 year → SHORT_TERM
        ];
        const event = makeEvent(1, 40000, '2025-07-01');

        // Select the old lot → LONG_TERM
        const r1 = calculateSpecificId(
            [makeLot('lot1', 1, 10000, '2024-01-01'), makeLot('lot2', 1, 50000, '2025-06-01')],
            event,
            [{ lotId: 'lot1', amount: 1 }],
        );
        expect(r1.holdingPeriod).toBe('LONG_TERM');

        // Select the new lot → SHORT_TERM
        const r2 = calculateSpecificId(
            [makeLot('lot1', 1, 10000, '2024-01-01'), makeLot('lot2', 1, 50000, '2025-06-01')],
            event,
            [{ lotId: 'lot2', amount: 1 }],
        );
        expect(r2.holdingPeriod).toBe('SHORT_TERM');
    });

    it('should handle fee deduction', () => {
        const lots = [makeLot('lot1', 1, 10000, '2024-01-01')];
        const event: TaxableEvent = {
            id: 'e1', asset: 'BTC', amount: 1, proceedsUsd: 15000,
            date: new Date('2025-01-01'), sourceId: 's1', feeUsd: 50,
        };
        const selections: LotSelection[] = [{ lotId: 'lot1', amount: 1 }];

        const result = calculateSpecificId(lots, event, selections);
        expect(result.gainLoss).toBe(4950); // 15000 - 10000 - 50
    });
});
