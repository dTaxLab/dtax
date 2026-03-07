/**
 * HIFO Tax Calculation Unit Tests
 *
 * Key difference: highest cost-per-unit lots consumed first.
 * Test strategy: verify cost-ordering (not date-ordering) drives lot selection.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import { calculateHIFO } from '../methods/hifo';
import type { TaxLot, TaxableEvent } from '../types';

function createLot(overrides: Partial<TaxLot> & { asset: string }): TaxLot {
    return {
        id: `lot-${Math.random().toString(36).slice(2, 8)}`,
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date('2024-01-01'),
        ...overrides,
    };
}

function createEvent(overrides: Partial<TaxableEvent> & { asset: string }): TaxableEvent {
    return {
        id: `event-${Math.random().toString(36).slice(2, 8)}`,
        amount: 1.0,
        proceedsUsd: 40000,
        date: new Date('2025-06-01'),
        ...overrides,
    };
}

describe('calculateHIFO', () => {
    // ── Test 1: Should consume highest cost-per-unit lot first ──
    it('should consume the highest cost-per-unit lot first', () => {
        const lots = [
            createLot({ id: 'cheap', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 10000, acquiredAt: new Date('2024-01-01') }),
            createLot({ id: 'mid', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 30000, acquiredAt: new Date('2024-03-01') }),
            createLot({ id: 'expensive', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 60000, acquiredAt: new Date('2024-06-01') }),
        ];

        const event = createEvent({ asset: 'BTC', sourceId: 'binance-1', amount: 1.0, proceedsUsd: 45000 });
        const result = calculateHIFO(lots, event);

        // HIFO: consumes 'expensive' ($60k/BTC) first
        expect(result.matchedLots).toHaveLength(1);
        expect(result.matchedLots[0].lotId).toBe('expensive');
        // Gain: $45k - $60k = -$15k (tax loss!)
        expect(result.gainLoss).toBeCloseTo(-15000, 2);
        expect(result.method).toBe('HIFO');
    });

    // ── Test 2: Multi-lot with varying cost-per-unit ──
    it('should span lots from highest to lowest cost-per-unit', () => {
        const lots = [
            createLot({ id: 'lot-A', asset: 'ETH', sourceId: 'binance-1', amount: 2.0, costBasisUsd: 4000, acquiredAt: new Date('2024-01-01') }),   // $2000/ETH
            createLot({ id: 'lot-B', asset: 'ETH', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 5000, acquiredAt: new Date('2024-03-01') }),   // $5000/ETH
            createLot({ id: 'lot-C', asset: 'ETH', sourceId: 'binance-1', amount: 3.0, costBasisUsd: 12000, acquiredAt: new Date('2024-06-01') }),  // $4000/ETH
        ];

        // Sell 3.5 ETH — HIFO order: lot-B ($5k, 1 ETH), lot-C ($4k, 3 ETH) → need 2.5 more from lot-C
        const event = createEvent({ asset: 'ETH', sourceId: 'binance-1', amount: 3.5, proceedsUsd: 14000 });
        const result = calculateHIFO(lots, event);

        expect(result.matchedLots).toHaveLength(2);
        expect(result.matchedLots[0].lotId).toBe('lot-B');  // $5000/ETH (highest)
        expect(result.matchedLots[0].amountConsumed).toBe(1.0);
        expect(result.matchedLots[1].lotId).toBe('lot-C');  // $4000/ETH (next highest)
        expect(result.matchedLots[1].amountConsumed).toBe(2.5);

        // Cost: lot-B (1 × $5000) + lot-C (2.5 × $4000) = $5000 + $10000 = $15000
        // Gain: $14000 - $15000 = -$1000
        expect(result.gainLoss).toBeCloseTo(-1000, 2);
    });

    // ── Test 3: HIFO minimizes gains compared to FIFO ──
    it('should produce lower gain than FIFO for the same data', () => {
        const lots = [
            createLot({ id: 'cheap', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 10000, acquiredAt: new Date('2023-01-01') }),
            createLot({ id: 'expensive', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 50000, acquiredAt: new Date('2024-06-01') }),
        ];

        const event = createEvent({ asset: 'BTC', sourceId: 'binance-1', amount: 1.0, proceedsUsd: 45000 });
        const result = calculateHIFO(lots, event);

        // HIFO: consumes 'expensive' ($50k) → gain = $45k - $50k = -$5k
        // FIFO would consume 'cheap' ($10k) → gain = $45k - $10k = +$35k
        // HIFO is $40k better for the taxpayer
        expect(result.gainLoss).toBeCloseTo(-5000, 2);
    });

    // ── Test 4: Equal cost-per-unit lots ──
    it('should handle lots with equal cost-per-unit', () => {
        const lots = [
            createLot({ id: 'lot-1', asset: 'BTC', sourceId: 'binance-1', amount: 0.5, costBasisUsd: 15000, acquiredAt: new Date('2024-01-01') }),
            createLot({ id: 'lot-2', asset: 'BTC', sourceId: 'binance-1', amount: 0.5, costBasisUsd: 15000, acquiredAt: new Date('2024-06-01') }),
        ];

        const event = createEvent({ asset: 'BTC', sourceId: 'binance-1', amount: 0.8, proceedsUsd: 32000 });
        const result = calculateHIFO(lots, event);

        // Both lots at $30k/BTC, so order doesn't matter — should consume 0.8 total
        const totalConsumed = result.matchedLots.reduce((sum, m) => sum + m.amountConsumed, 0);
        expect(totalConsumed).toBeCloseTo(0.8, 8);
        // Cost: 0.8 × $30000 = $24000
        // Gain: $32000 - $24000 = $8000
        expect(result.gainLoss).toBeCloseTo(8000, 2);
    });

    // ── Test 5: Holding period uses earliest matched lot ──
    it('should determine holding period from earliest matched lot', () => {
        const lots = [
            createLot({ id: 'old-expensive', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 60000, acquiredAt: new Date('2023-01-01') }),
            createLot({ id: 'new-cheap', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 20000, acquiredAt: new Date('2025-03-01') }),
        ];

        // HIFO picks 'old-expensive' (higher cost), which was acquired 2023-01-01
        const event = createEvent({ asset: 'BTC', sourceId: 'binance-1', amount: 0.5, proceedsUsd: 25000, date: new Date('2025-06-01') });
        const result = calculateHIFO(lots, event);

        expect(result.matchedLots[0].lotId).toBe('old-expensive');
        expect(result.holdingPeriod).toBe('LONG_TERM');  // 2023-01-01 → 2025-06-01 > 1 year
    });

    // ── Test 6: Fee deduction ──
    it('should deduct fees from gain', () => {
        const lots = [
            createLot({ id: 'lot-1', asset: 'BTC', sourceId: 'binance-1', amount: 1.0, costBasisUsd: 30000 }),
        ];

        const event = createEvent({ asset: 'BTC', sourceId: 'binance-1', amount: 1.0, proceedsUsd: 40000, feeUsd: 250 });
        const result = calculateHIFO(lots, event);

        expect(result.gainLoss).toBeCloseTo(9750, 2);
    });

    // ── Test 7: Different lot sizes with cost-per-unit ordering ──
    it('should order by cost-per-unit not total cost', () => {
        const lots = [
            createLot({ id: 'big-lot', asset: 'SOL', amount: 100, costBasisUsd: 5000, acquiredAt: new Date('2024-01-01') }),   // $50/SOL
            createLot({ id: 'small-lot', asset: 'SOL', amount: 2, costBasisUsd: 400, acquiredAt: new Date('2024-06-01') }),    // $200/SOL
        ];

        // HIFO: small-lot ($200/SOL) consumed first despite lower total cost
        const event = createEvent({ asset: 'SOL', amount: 1.0, proceedsUsd: 150 });
        const result = calculateHIFO(lots, event);

        expect(result.matchedLots[0].lotId).toBe('small-lot');
        // Cost: 1 × $200 = $200
        // Gain: $150 - $200 = -$50
        expect(result.gainLoss).toBeCloseTo(-50, 2);
    });
});
