/**
 * Tests for price service utility functions.
 * Note: fetchPrices() is not tested here since it calls external API.
 * Only pure functions are unit-tested.
 */

import { describe, it, expect } from 'vitest';
import { resolveCoingeckoIds, getSupportedTickers, clearPriceCache } from '../lib/prices';

describe('Price Service', () => {
    it('should resolve known tickers to CoinGecko IDs', () => {
        const result = resolveCoingeckoIds(['BTC', 'ETH', 'SOL']);
        expect(result.get('BTC')).toBe('bitcoin');
        expect(result.get('ETH')).toBe('ethereum');
        expect(result.get('SOL')).toBe('solana');
    });

    it('should handle case-insensitive tickers', () => {
        const result = resolveCoingeckoIds(['btc', 'Eth', 'SOL']);
        expect(result.get('BTC')).toBe('bitcoin');
        expect(result.get('ETH')).toBe('ethereum');
        expect(result.get('SOL')).toBe('solana');
    });

    it('should fall back to lowercase for unknown tickers', () => {
        const result = resolveCoingeckoIds(['UNKNOWN', 'NEWCOIN']);
        expect(result.get('UNKNOWN')).toBe('unknown');
        expect(result.get('NEWCOIN')).toBe('newcoin');
    });

    it('should resolve stablecoins', () => {
        const result = resolveCoingeckoIds(['USDT', 'USDC', 'DAI']);
        expect(result.get('USDT')).toBe('tether');
        expect(result.get('USDC')).toBe('usd-coin');
        expect(result.get('DAI')).toBe('dai');
    });

    it('should return all supported tickers', () => {
        const tickers = getSupportedTickers();
        expect(tickers).toContain('BTC');
        expect(tickers).toContain('ETH');
        expect(tickers).toContain('SOL');
        expect(tickers.length).toBeGreaterThan(10);
    });

    it('should handle empty input', () => {
        const result = resolveCoingeckoIds([]);
        expect(result.size).toBe(0);
    });

    it('should handle duplicate tickers', () => {
        const result = resolveCoingeckoIds(['BTC', 'BTC', 'ETH']);
        expect(result.size).toBe(2);
        expect(result.get('BTC')).toBe('bitcoin');
    });

    it('should clear cache without error', () => {
        expect(() => clearPriceCache()).not.toThrow();
    });
});
