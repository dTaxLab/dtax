/**
 * Tests for Wrap/Unwrap Normalizer
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import {
    isWrapPair,
    getUnderlyingAsset,
    processWrapUnwrap,
    WrapEvent,
} from '../wrap-unwrap';
import type { TaxLot } from '../../types';

describe('isWrapPair', () => {
    it('should recognize ETH/WETH as a wrap pair', () => {
        expect(isWrapPair('ETH', 'WETH')).toBe(true);
        expect(isWrapPair('WETH', 'ETH')).toBe(true);
    });

    it('should recognize BTC/WBTC as a wrap pair', () => {
        expect(isWrapPair('BTC', 'WBTC')).toBe(true);
        expect(isWrapPair('WBTC', 'BTC')).toBe(true);
    });

    it('should recognize liquid staking derivatives', () => {
        expect(isWrapPair('stETH', 'ETH')).toBe(true);
        expect(isWrapPair('ETH', 'rETH')).toBe(true);
    });

    it('should return false for unrelated assets', () => {
        expect(isWrapPair('ETH', 'BTC')).toBe(false);
        expect(isWrapPair('USDC', 'USDT')).toBe(false);
    });
});

describe('getUnderlyingAsset', () => {
    it('should return underlying for wrapped tokens', () => {
        expect(getUnderlyingAsset('WETH')).toBe('ETH');
        expect(getUnderlyingAsset('WBTC')).toBe('BTC');
    });

    it('should return the same asset if not wrapped', () => {
        expect(getUnderlyingAsset('ETH')).toBe('ETH');
        expect(getUnderlyingAsset('USDC')).toBe('USDC');
    });
});

describe('processWrapUnwrap', () => {
    function makeLot(overrides: Partial<TaxLot> = {}): TaxLot {
        return {
            id: 'lot-1',
            asset: 'ETH',
            amount: 10,
            costBasisUsd: 20000,
            acquiredAt: new Date('2024-01-15'),
            sourceId: 'wallet-1',
            ...overrides,
        };
    }

    function makeEvent(overrides: Partial<WrapEvent> = {}): WrapEvent {
        return {
            id: 'wrap-1',
            fromAsset: 'ETH',
            toAsset: 'WETH',
            amount: 5,
            feeUsd: 0,
            timestamp: new Date('2025-03-01'),
            sourceId: 'wallet-1',
            ...overrides,
        };
    }

    it('should carry over basis from ETH to WETH (partial lot)', () => {
        const lots = [makeLot()];
        const event = makeEvent({ amount: 5 });

        const result = processWrapUnwrap(lots, event);

        // Original lot should be reduced
        expect(lots[0].amount).toBe(5);
        expect(lots[0].costBasisUsd).toBe(10000);

        // New WETH lot should have carried-over basis
        expect(result.newLots).toHaveLength(1);
        expect(result.newLots[0].asset).toBe('WETH');
        expect(result.newLots[0].amount).toBe(5);
        expect(result.newLots[0].costBasisUsd).toBe(10000);
        expect(result.basisCarriedOver).toBe(10000);
    });

    it('should preserve original acquisition date', () => {
        const acquiredDate = new Date('2023-06-15');
        const lots = [makeLot({ acquiredAt: acquiredDate })];
        const event = makeEvent({ amount: 5 });

        const result = processWrapUnwrap(lots, event);

        expect(result.newLots[0].acquiredAt).toEqual(acquiredDate);
    });

    it('should handle full lot consumption', () => {
        const lots = [makeLot({ amount: 5, costBasisUsd: 10000 })];
        const event = makeEvent({ amount: 5 });

        const result = processWrapUnwrap(lots, event);

        expect(lots[0].amount).toBe(0);
        expect(lots[0].costBasisUsd).toBe(0);
        expect(result.newLots[0].amount).toBe(5);
        expect(result.newLots[0].costBasisUsd).toBe(10000);
    });

    it('should consume multiple lots in FIFO order', () => {
        const lots = [
            makeLot({ id: 'lot-1', amount: 3, costBasisUsd: 6000, acquiredAt: new Date('2024-01-01') }),
            makeLot({ id: 'lot-2', amount: 4, costBasisUsd: 12000, acquiredAt: new Date('2024-06-01') }),
        ];
        const event = makeEvent({ amount: 5 });

        const result = processWrapUnwrap(lots, event);

        // First lot fully consumed
        expect(lots[0].amount).toBe(0);
        // Second lot partially consumed (2 of 4)
        expect(lots[1].amount).toBe(2);
        expect(lots[1].costBasisUsd).toBe(6000); // 12000 * (2/4)

        // Two new WETH lots created
        expect(result.newLots).toHaveLength(2);
        expect(result.newLots[0].amount).toBe(3);
        expect(result.newLots[0].costBasisUsd).toBe(6000);
        expect(result.newLots[0].acquiredAt).toEqual(new Date('2024-01-01'));
        expect(result.newLots[1].amount).toBe(2);
        expect(result.newLots[1].costBasisUsd).toBe(6000);
        expect(result.newLots[1].acquiredAt).toEqual(new Date('2024-06-01'));
    });

    it('should add gas fee to new lot basis', () => {
        const lots = [makeLot({ amount: 5, costBasisUsd: 10000 })];
        const event = makeEvent({ amount: 5, feeUsd: 25 });

        const result = processWrapUnwrap(lots, event);

        expect(result.newLots[0].costBasisUsd).toBe(10025); // basis + fee
        expect(result.feeAdded).toBe(25);
    });

    it('should distribute fee proportionally across multiple new lots', () => {
        const lots = [
            makeLot({ id: 'lot-1', amount: 2, costBasisUsd: 4000, acquiredAt: new Date('2024-01-01') }),
            makeLot({ id: 'lot-2', amount: 8, costBasisUsd: 24000, acquiredAt: new Date('2024-06-01') }),
        ];
        const event = makeEvent({ amount: 10, feeUsd: 50 });

        const result = processWrapUnwrap(lots, event);

        // Fee should be split: 2/10 = $10, 8/10 = $40
        expect(result.newLots[0].costBasisUsd).toBe(4000 + 10);
        expect(result.newLots[1].costBasisUsd).toBe(24000 + 40);
    });

    it('should handle unwrap (WETH → ETH) the same way', () => {
        const lots = [makeLot({ asset: 'WETH', amount: 3, costBasisUsd: 6000 })];
        const event = makeEvent({ fromAsset: 'WETH', toAsset: 'ETH', amount: 3 });

        const result = processWrapUnwrap(lots, event);

        expect(result.newLots[0].asset).toBe('ETH');
        expect(result.newLots[0].amount).toBe(3);
        expect(result.newLots[0].costBasisUsd).toBe(6000);
    });

    it('should return empty result when no matching lots exist', () => {
        const lots = [makeLot({ asset: 'BTC' })]; // No ETH lots
        const event = makeEvent({ fromAsset: 'ETH', toAsset: 'WETH', amount: 5 });

        const result = processWrapUnwrap(lots, event);

        expect(result.newLots).toHaveLength(0);
        expect(result.basisCarriedOver).toBe(0);
    });
});
