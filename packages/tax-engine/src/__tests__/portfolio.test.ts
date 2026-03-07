/**
 * Tests for portfolio holdings analysis and TLH identification.
 */

import { describe, it, expect } from 'vitest';
import { analyzeHoldings } from '../portfolio';
import type { TaxLot } from '../types';
import type { PriceMap } from '../portfolio';

const REF_DATE = new Date('2026-03-07');

function makeLot(overrides: Partial<TaxLot> = {}): TaxLot {
    return {
        id: 'lot-1',
        asset: 'BTC',
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date('2025-01-15'),
        sourceId: 'coinbase',
        ...overrides,
    };
}

describe('Portfolio Holdings Analyzer', () => {
    it('should aggregate lots into positions', () => {
        const lots = [
            makeLot({ id: 'lot-1', amount: 0.5, costBasisUsd: 15000 }),
            makeLot({ id: 'lot-2', amount: 0.3, costBasisUsd: 12000 }),
        ];

        const result = analyzeHoldings(lots, undefined, REF_DATE);

        expect(result.positions).toHaveLength(1);
        const btc = result.positions[0];
        expect(btc.asset).toBe('BTC');
        expect(btc.totalAmount).toBe(0.8);
        expect(btc.totalCostBasis).toBe(27000);
        expect(btc.avgCostPerUnit).toBeCloseTo(33750, 0);
        expect(btc.lotCount).toBe(2);
    });

    it('should filter out zero-amount lots', () => {
        const lots = [
            makeLot({ id: 'lot-1', amount: 1.0 }),
            makeLot({ id: 'lot-2', amount: 0, costBasisUsd: 0 }),
        ];

        const result = analyzeHoldings(lots, undefined, REF_DATE);
        expect(result.positions).toHaveLength(1);
        expect(result.positions[0].lotCount).toBe(1);
    });

    it('should compute unrealized gains with prices', () => {
        const lots = [
            makeLot({ id: 'lot-1', amount: 1.0, costBasisUsd: 30000 }),
        ];
        const prices: PriceMap = new Map([['BTC', 45000]]);

        const result = analyzeHoldings(lots, prices, REF_DATE);
        const btc = result.positions[0];

        expect(btc.currentPrice).toBe(45000);
        expect(btc.currentValueUsd).toBe(45000);
        expect(btc.unrealizedGainLoss).toBe(15000);
        expect(btc.unrealizedPct).toBeCloseTo(50, 0);
        expect(result.totalCurrentValue).toBe(45000);
        expect(result.totalUnrealizedGainLoss).toBe(15000);
    });

    it('should compute unrealized losses with prices', () => {
        const lots = [
            makeLot({ id: 'lot-1', amount: 1.0, costBasisUsd: 50000 }),
        ];
        const prices: PriceMap = new Map([['BTC', 40000]]);

        const result = analyzeHoldings(lots, prices, REF_DATE);
        const btc = result.positions[0];

        expect(btc.unrealizedGainLoss).toBe(-10000);
        expect(btc.unrealizedPct).toBeCloseTo(-20, 0);
    });

    it('should classify holding period correctly', () => {
        const lots = [
            makeLot({ id: 'lt', acquiredAt: new Date('2024-06-01') }), // > 1 year
            makeLot({ id: 'st', acquiredAt: new Date('2026-01-15') }), // < 1 year
        ];

        const result = analyzeHoldings(lots, undefined, REF_DATE);
        const btc = result.positions[0];

        const ltLot = btc.lots.find(l => l.lotId === 'lt');
        const stLot = btc.lots.find(l => l.lotId === 'st');
        expect(ltLot?.isLongTerm).toBe(true);
        expect(stLot?.isLongTerm).toBe(false);
    });

    it('should group multiple assets correctly', () => {
        const lots = [
            makeLot({ id: 'btc-1', asset: 'BTC', amount: 1.0, costBasisUsd: 30000 }),
            makeLot({ id: 'eth-1', asset: 'ETH', amount: 10.0, costBasisUsd: 20000 }),
            makeLot({ id: 'eth-2', asset: 'ETH', amount: 5.0, costBasisUsd: 12000 }),
        ];
        const prices: PriceMap = new Map([['BTC', 45000], ['ETH', 2500]]);

        const result = analyzeHoldings(lots, prices, REF_DATE);

        expect(result.positions).toHaveLength(2);
        // Sorted by current value desc: BTC $45000, ETH $37500
        expect(result.positions[0].asset).toBe('BTC');
        expect(result.positions[1].asset).toBe('ETH');
        expect(result.positions[1].totalAmount).toBe(15.0);
        expect(result.positions[1].totalCostBasis).toBe(32000);
        expect(result.positions[1].currentValueUsd).toBe(37500);
    });

    it('should identify TLH opportunities', () => {
        const lots = [
            makeLot({ id: 'btc-win', asset: 'BTC', amount: 0.5, costBasisUsd: 10000 }),
            makeLot({ id: 'eth-lose', asset: 'ETH', amount: 10, costBasisUsd: 30000 }),
        ];
        // BTC is up, ETH is down
        const prices: PriceMap = new Map([['BTC', 45000], ['ETH', 2000]]);

        const result = analyzeHoldings(lots, prices, REF_DATE);

        expect(result.tlhOpportunities).toHaveLength(1);
        const tlh = result.tlhOpportunities[0];
        expect(tlh.asset).toBe('ETH');
        expect(tlh.unrealizedLoss).toBe(-10000); // 20000 - 30000
        expect(tlh.totalAmount).toBe(10);
        expect(tlh.currentValue).toBe(20000);
        expect(result.totalTlhAvailable).toBe(-10000);
    });

    it('should flag short-term lots in TLH for wash sale awareness', () => {
        const lots = [
            makeLot({ id: 'st', asset: 'ETH', amount: 5, costBasisUsd: 20000, acquiredAt: new Date('2026-01-01') }),
            makeLot({ id: 'lt', asset: 'ETH', amount: 5, costBasisUsd: 25000, acquiredAt: new Date('2024-06-01') }),
        ];
        const prices: PriceMap = new Map([['ETH', 2000]]);

        const result = analyzeHoldings(lots, prices, REF_DATE);
        // Both lots are at a loss (10000 vs 20000, 10000 vs 25000)
        expect(result.tlhOpportunities).toHaveLength(1);
        expect(result.tlhOpportunities[0].hasShortTermLots).toBe(true);
    });

    it('should not show TLH when no prices provided', () => {
        const lots = [makeLot()];

        const result = analyzeHoldings(lots, undefined, REF_DATE);

        expect(result.tlhOpportunities).toHaveLength(0);
        expect(result.totalTlhAvailable).toBe(0);
        expect(result.totalCurrentValue).toBeUndefined();
    });

    it('should handle mixed gain/loss lots within same asset', () => {
        const lots = [
            makeLot({ id: 'cheap', asset: 'BTC', amount: 0.5, costBasisUsd: 10000 }),   // bought cheap
            makeLot({ id: 'expensive', asset: 'BTC', amount: 0.5, costBasisUsd: 30000 }), // bought expensive
        ];
        const prices: PriceMap = new Map([['BTC', 40000]]); // current price

        const result = analyzeHoldings(lots, prices, REF_DATE);

        // Overall: value 40000, basis 40000, break even
        const btc = result.positions[0];
        expect(btc.unrealizedGainLoss).toBe(0);

        // But TLH should find the expensive lot as a loss
        expect(result.tlhOpportunities).toHaveLength(1);
        const tlh = result.tlhOpportunities[0];
        expect(tlh.loseLots).toHaveLength(1);
        expect(tlh.loseLots[0].lotId).toBe('expensive');
        expect(tlh.unrealizedLoss).toBe(-10000); // 0.5 * 40000 - 30000
    });

    it('should handle empty lots gracefully', () => {
        const result = analyzeHoldings([], undefined, REF_DATE);

        expect(result.positions).toHaveLength(0);
        expect(result.totalCostBasis).toBe(0);
        expect(result.tlhOpportunities).toHaveLength(0);
        expect(result.totalTlhAvailable).toBe(0);
    });

    it('should sort positions by current value descending', () => {
        const lots = [
            makeLot({ id: '1', asset: 'DOGE', amount: 10000, costBasisUsd: 500 }),
            makeLot({ id: '2', asset: 'BTC', amount: 1, costBasisUsd: 30000 }),
            makeLot({ id: '3', asset: 'ETH', amount: 10, costBasisUsd: 20000 }),
        ];
        const prices: PriceMap = new Map([['DOGE', 0.1], ['BTC', 45000], ['ETH', 2500]]);

        const result = analyzeHoldings(lots, prices, REF_DATE);

        expect(result.positions.map(p => p.asset)).toEqual(['BTC', 'ETH', 'DOGE']);
    });

    it('should sort TLH opportunities by largest loss first', () => {
        const lots = [
            makeLot({ id: '1', asset: 'ETH', amount: 10, costBasisUsd: 30000 }),
            makeLot({ id: '2', asset: 'SOL', amount: 100, costBasisUsd: 15000 }),
        ];
        const prices: PriceMap = new Map([['ETH', 2000], ['SOL', 100]]);

        const result = analyzeHoldings(lots, prices, REF_DATE);

        // ETH loss: 20000 - 30000 = -10000, SOL loss: 10000 - 15000 = -5000
        expect(result.tlhOpportunities).toHaveLength(2);
        expect(result.tlhOpportunities[0].asset).toBe('ETH'); // bigger loss first
        expect(result.tlhOpportunities[1].asset).toBe('SOL');
    });
});
