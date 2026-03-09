/**
 * Bitget CSV Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseBitgetCsv, isBitgetCsv } from '../parsers/bitget';
import { parseCsv, detectCsvFormat } from '../parsers';

describe('isBitgetCsv', () => {
    it('detects Bitget format by header (standard)', () => {
        const csv = 'Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time,Order Type\n';
        expect(isBitgetCsv(csv)).toBe(true);
    });

    it('detects Bitget format by header (API-style)', () => {
        const csv = 'orderId,symbol,side,priceAvg,size,baseVolume,quoteVolume,fee,feeCurrency,cTime\n';
        expect(isBitgetCsv(csv)).toBe(true);
    });

    it('rejects non-Bitget format', () => {
        expect(isBitgetCsv('Timestamp,Transaction Type,Asset,Quantity Transacted')).toBe(false);
    });
});

describe('detectCsvFormat', () => {
    it('auto-detects Bitget', () => {
        const csv = 'Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time,Order Type\n';
        expect(detectCsvFormat(csv)).toBe('bitget');
    });
});

describe('parseBitgetCsv', () => {
    const HEADER = 'Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time,Order Type';

    it('parses a buy trade', () => {
        const csv = `${HEADER}\n1001,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-01-15 10:30:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('BUY');
        expect(tx.receivedAsset).toBe('BTC');
        expect(tx.receivedAmount).toBe(1);
        expect(tx.sentAsset).toBe('USDT');
        expect(tx.sentAmount).toBe(50000);
        expect(tx.receivedValueUsd).toBe(50000);
        expect(tx.feeAmount).toBe(50);
        expect(tx.feeAsset).toBe('USDT');
    });

    it('parses a sell trade', () => {
        const csv = `${HEADER}\n1002,ETHUSDT,Sell,3000,2.0,6000,6,USDT,2025-02-20 14:00:00,Market`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('SELL');
        expect(tx.sentAsset).toBe('ETH');
        expect(tx.sentAmount).toBe(2);
        expect(tx.receivedAsset).toBe('USDT');
        expect(tx.receivedAmount).toBe(6000);
        expect(tx.sentValueUsd).toBe(6000);
    });

    it('classifies crypto-to-crypto as TRADE', () => {
        const csv = `${HEADER}\n1003,ETHBTC,Buy,0.05,10.0,0.5,0.0005,BTC,2025-03-01 12:00:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRADE');
        expect(tx.receivedAsset).toBe('ETH');
        expect(tx.sentAsset).toBe('BTC');
    });

    it('strips Bitget product suffix from symbol', () => {
        const csv = `${HEADER}\n1004,BTCUSDT_SPBL,Buy,50000,0.5,25000,25,USDT,2025-04-01 08:00:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].receivedAsset).toBe('BTC');
        expect(result.transactions[0].sentAsset).toBe('USDT');
    });

    it('handles API-style column names with Unix ms timestamp', () => {
        const ts = new Date('2025-01-15T10:30:00Z').getTime();
        const csv = `orderId,symbol,side,priceAvg,size,baseVolume,quoteVolume,fee,feeCurrency,cTime\n1005,BTCUSDT,buy,50000,1.0,1.0,50000,50,USDT,${ts}`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('BUY');
        expect(result.transactions[0].receivedAsset).toBe('BTC');
    });

    it('computes total from price * qty when total is missing', () => {
        const header = 'Order ID,Trading Pair,Side,Filled Price,Filled Amount,Fee,Fee Currency,Order Time';
        const csv = `${header}\n1006,ETHUSDT,Buy,3000,2.0,3,USDT,2025-06-01 12:00:00`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].sentAmount).toBe(6000);
    });

    it('handles invalid symbol', () => {
        const csv = `${HEADER}\n1007,X,Buy,100,1.0,100,0.1,USDT,2025-01-01 00:00:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Invalid symbol');
    });

    it('handles invalid date', () => {
        const csv = `${HEADER}\n1008,BTCUSDT,Buy,50000,1.0,50000,50,USDT,bad_date,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Invalid date');
    });

    it('handles invalid quantity', () => {
        const csv = `${HEADER}\n1009,BTCUSDT,Buy,50000,0,0,50,USDT,2025-01-01 00:00:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Invalid quantity');
    });

    it('handles empty CSV', () => {
        const result = parseBitgetCsv('');
        expect(result.transactions).toHaveLength(0);
        expect(result.summary.format).toBe('bitget');
    });

    it('sorts by timestamp', () => {
        const csv = `${HEADER}
1010,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-03-01 12:00:00,Limit
1011,ETHUSDT,Sell,3000,2.0,6000,6,USDT,2025-01-01 08:00:00,Market`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].type).toBe('SELL'); // earlier
        expect(result.transactions[1].type).toBe('BUY');
    });

    it('handles zero fee', () => {
        const csv = `${HEADER}\n1012,BTCUSDT,Buy,50000,1.0,50000,0,USDT,2025-01-15 10:30:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].feeAmount).toBeUndefined();
    });

    it('handles negative fee', () => {
        const csv = `${HEADER}\n1013,BTCUSDT,Buy,50000,1.0,50000,-50,USDT,2025-01-15 10:30:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].feeAmount).toBe(50);
    });

    it('provides correct summary', () => {
        const csv = `${HEADER}
1014,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-01-15 10:30:00,Limit
1015,ETHUSDT,Sell,3000,2.0,6000,6,USDT,2025-01-15 10:35:00,Market`;
        const result = parseBitgetCsv(csv);

        expect(result.summary.totalRows).toBe(2);
        expect(result.summary.parsed).toBe(2);
        expect(result.summary.failed).toBe(0);
        expect(result.summary.format).toBe('bitget');
    });

    it('handles USDC as fiat-like quote', () => {
        const csv = `${HEADER}\n1016,SOLUSDC,Buy,150,10.0,1500,1.5,USDC,2025-05-01 00:00:00,Limit`;
        const result = parseBitgetCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('BUY');
        expect(result.transactions[0].receivedValueUsd).toBe(1500);
    });

    it('works via unified parseCsv', () => {
        const csv = `${HEADER}\n1017,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-01-15 10:30:00,Limit`;
        const result = parseCsv(csv);

        expect(result.summary.format).toBe('bitget');
        expect(result.transactions).toHaveLength(1);
    });
});
