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
                asset: 'BTC',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
            {
                id: 'lot-2',
                asset: 'ETH',
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
                asset: 'BTC',
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
                asset: 'BTC',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
        ]);

        const event: TaxableEvent = {
            id: 'sale-1',
            asset: 'BTC',
            amount: 1.0,
            proceedsUsd: 45000,
            date: new Date('2025-06-01'),
        };

        const result = calc.calculate(event);

        expect(result.gainLoss).toBe(15000);
        expect(result.method).toBe('FIFO');
    });

    it('should throw for unimplemented LIFO method', () => {
        const calc = new CostBasisCalculator('LIFO');
        calc.addLots([
            {
                id: 'lot-1',
                asset: 'BTC',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
        ]);

        const event: TaxableEvent = {
            id: 'sale-1',
            asset: 'BTC',
            amount: 1.0,
            proceedsUsd: 45000,
            date: new Date('2025-06-01'),
        };

        expect(() => calc.calculate(event)).toThrow('LIFO not yet implemented');
    });

    it('should throw for unimplemented HIFO method', () => {
        const calc = new CostBasisCalculator('HIFO');
        calc.addLots([
            {
                id: 'lot-1',
                asset: 'BTC',
                amount: 1.0,
                costBasisUsd: 30000,
                acquiredAt: new Date('2024-01-01'),
            },
        ]);

        const event: TaxableEvent = {
            id: 'sale-1',
            asset: 'BTC',
            amount: 1.0,
            proceedsUsd: 45000,
            date: new Date('2025-06-01'),
        };

        expect(() => calc.calculate(event)).toThrow('HIFO not yet implemented');
    });
});
