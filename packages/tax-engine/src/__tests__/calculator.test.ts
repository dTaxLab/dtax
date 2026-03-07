/**
 * CostBasisCalculator Unit Tests
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import { CostBasisCalculator } from '../calculator';
import type { TaxLot, TaxableEvent } from '../types';

describe('CostBasisCalculator', () => {
    it('should default to FIFO method', () => {
        const calc = new CostBasisCalculator();
        expect(calc.getMethod()).toBe('FIFO');
    });

    it('should accept custom method in constructor', () => {
        const calc = new CostBasisCalculator('LIFO');
        expect(calc.getMethod()).toBe('LIFO');
    });

    it('should allow changing method', () => {
        const calc = new CostBasisCalculator('FIFO');
        calc.setMethod('HIFO');
        expect(calc.getMethod()).toBe('HIFO');
    });

    it('should add lots and retrieve them', () => {
        const calc = new CostBasisCalculator();
        const lots: TaxLot[] = [
            {
                id: 'lot-1',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
            {
                id: 'lot-2',
                asset: 'ETH', sourceId: 'binance-1',
                amount: 10.0,
                costBasisUsd: 20000,
                acquiredAt: new Date('2024-03-01'),
            },
        ];

        calc.addLots(lots);

        const retrieved = calc.getLots();
        expect(retrieved).toHaveLength(2);
        expect(retrieved[0].id).toBe('lot-1');
        expect(retrieved[1].id).toBe('lot-2');
    });

    it('should return a copy of lots (immutability)', () => {
        const calc = new CostBasisCalculator();
        calc.addLots([
            {
                id: 'lot-1',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
        ]);

        const lots1 = calc.getLots();
        const lots2 = calc.getLots();
        expect(lots1).not.toBe(lots2); // Different references
        expect(lots1).toEqual(lots2); // Same content
    });

    it('should calculate using FIFO method', () => {
        const calc = new CostBasisCalculator('FIFO');
        calc.addLots([
            {
                id: 'lot-1',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
        ]);

        const event: TaxableEvent = {
            id: 'sale-1',
            asset: 'BTC', sourceId: 'binance-1',
            amount: 1.0,
            proceedsUsd: 45000,
            date: new Date('2025-06-01'),
        };

        const result = calc.calculate(event);

        expect(result.gainLoss).toBe(15000);
        expect(result.method).toBe('FIFO');
    });

    it('should calculate using LIFO method', () => {
        const calc = new CostBasisCalculator('LIFO');
        calc.addLots([
            {
                id: 'lot-old',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 20000,
                acquiredAt: new Date('2023-01-01'),
            },
            {
                id: 'lot-new',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 40000,
                acquiredAt: new Date('2024-06-01'),
            },
        ]);

        const event: TaxableEvent = {
            id: 'sale-1',
            asset: 'BTC', sourceId: 'binance-1',
            amount: 1.0,
            proceedsUsd: 45000,
            date: new Date('2025-06-01'),
        };

        const result = calc.calculate(event);

        // LIFO: consumes lot-new ($40k) → gain = $45k - $40k = $5k
        expect(result.gainLoss).toBe(5000);
        expect(result.method).toBe('LIFO');
        expect(result.matchedLots[0].lotId).toBe('lot-new');
    });

    it('should correctly consume lots across multiple calculate() calls', () => {
        const calc = new CostBasisCalculator('FIFO');
        calc.addLots([
            {
                id: 'lot-1',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
        ]);

        // First sale: sell 0.6 BTC
        const sale1: TaxableEvent = {
            id: 'sale-1',
            asset: 'BTC', sourceId: 'binance-1',
            amount: 0.6,
            proceedsUsd: 27000, // $45k per BTC
            date: new Date('2025-06-01'),
        };
        const result1 = calc.calculate(sale1);
        expect(result1.gainLoss).toBe(9000); // 27000 - 18000

        // Second sale: sell 0.6 BTC — but only 0.4 remains in lot
        const sale2: TaxableEvent = {
            id: 'sale-2',
            asset: 'BTC', sourceId: 'binance-1',
            amount: 0.6,
            proceedsUsd: 27000,
            date: new Date('2025-07-01'),
        };
        const result2 = calc.calculate(sale2);

        // Should only match 0.4 BTC remaining (not 0.6 again!)
        expect(result2.matchedLots).toHaveLength(1);
        expect(result2.matchedLots[0].amountConsumed).toBeCloseTo(0.4, 8);
        // Cost basis for 0.4 BTC = 30000 * 0.4 = 12000
        expect(result2.matchedLots[0].costBasisUsd).toBeCloseTo(12000, 2);
    });

    it('should fully deplete lots and report insufficient on subsequent calls', () => {
        const calc = new CostBasisCalculator('FIFO');
        calc.addLots([
            {
                id: 'lot-1',
                asset: 'ETH', sourceId: 'cb-1',
                amount: 2.0,
                costBasisUsd: 4000,
                acquiredAt: new Date('2024-01-01'),
            },
        ]);

        // Sell all 2.0 ETH
        const sale1: TaxableEvent = {
            id: 'sale-1',
            asset: 'ETH', sourceId: 'cb-1',
            amount: 2.0,
            proceedsUsd: 6000,
            date: new Date('2025-01-01'),
        };
        calc.calculate(sale1);

        // Try selling more — lot should be depleted
        const sale2: TaxableEvent = {
            id: 'sale-2',
            asset: 'ETH', sourceId: 'cb-1',
            amount: 1.0,
            proceedsUsd: 3000,
            date: new Date('2025-02-01'),
        };
        const result2 = calc.calculate(sale2);
        expect(result2.matchedLots).toHaveLength(0);
    });

    it('should calculate using HIFO method', () => {
        const calc = new CostBasisCalculator('HIFO');
        calc.addLots([
            {
                id: 'lot-cheap',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 20000,
                acquiredAt: new Date('2024-01-01'),
            },
            {
                id: 'lot-expensive',
                asset: 'BTC', sourceId: 'binance-1',
                amount: 1.0,
                costBasisUsd: 50000,
                acquiredAt: new Date('2024-06-01'),
            },
        ]);

        const event: TaxableEvent = {
            id: 'sale-1',
            asset: 'BTC', sourceId: 'binance-1',
            amount: 1.0,
            proceedsUsd: 45000,
            date: new Date('2025-06-01'),
        };

        const result = calc.calculate(event);

        // HIFO: consumes lot-expensive ($50k) → gain = $45k - $50k = -$5k
        expect(result.gainLoss).toBe(-5000);
        expect(result.method).toBe('HIFO');
        expect(result.matchedLots[0].lotId).toBe('lot-expensive');
    });
});
