/**
 * Gate.io CSV Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseGateCsv, isGateCsv } from '../parsers/gate';
import { parseCsv, detectCsvFormat } from '../parsers';

describe('isGateCsv', () => {
    it('detects Gate.io format by header (standard)', () => {
        const csv = 'No,Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date\n';
        expect(isGateCsv(csv)).toBe(true);
    });

    it('detects Gate.io format by header (API-style)', () => {
        const csv = 'id,currency_pair,side,role,amount,price,fee,fee_currency,create_time,point_fee\n';
        expect(isGateCsv(csv)).toBe(true);
    });

    it('rejects non-Gate.io format', () => {
        expect(isGateCsv('Timestamp,Transaction Type,Asset,Quantity Transacted')).toBe(false);
    });
});

describe('detectCsvFormat', () => {
    it('auto-detects Gate.io', () => {
        const csv = 'No,Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date\n';
        expect(detectCsvFormat(csv)).toBe('gate');
    });
});

describe('parseGateCsv', () => {
    const HEADER = 'No,Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date';

    it('parses a buy trade', () => {
        const csv = `${HEADER}\n1001,BTC_USDT,buy,taker,50000,1.0,50000,50,USDT,2025-01-15 10:30:00`;
        const result = parseGateCsv(csv);

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
        expect(tx.feeValueUsd).toBe(50);
    });

    it('parses a sell trade', () => {
        const csv = `${HEADER}\n1002,ETH_USDT,sell,maker,3000,2.0,6000,6,USDT,2025-02-20 14:00:00`;
        const result = parseGateCsv(csv);

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
        const csv = `${HEADER}\n1003,ETH_BTC,buy,taker,0.05,10.0,0.5,0.0005,BTC,2025-03-01 12:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRADE');
        expect(tx.receivedAsset).toBe('ETH');
        expect(tx.receivedAmount).toBe(10);
        expect(tx.sentAsset).toBe('BTC');
        expect(tx.sentAmount).toBe(0.5);
    });

    it('handles API-style column names', () => {
        const csv = 'id,currency_pair,side,role,amount,price,fee,fee_currency,create_time,point_fee\n1004,BTC_USDT,buy,taker,1.0,50000,50,USDT,2025-01-15 10:30:00,0';
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('BUY');
        expect(result.transactions[0].receivedAsset).toBe('BTC');
    });

    it('handles hyphen separator in pair', () => {
        const csv = `${HEADER}\n1005,BTC-USDT,buy,taker,60000,0.5,30000,30,USDT,2025-04-01 08:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].receivedAsset).toBe('BTC');
        expect(result.transactions[0].sentAsset).toBe('USDT');
    });

    it('handles slash separator in pair', () => {
        const csv = `${HEADER}\n1006,SOL/USDT,buy,maker,150,10,1500,1.5,USDT,2025-05-01 00:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].receivedAsset).toBe('SOL');
    });

    it('computes total from price * amount when total is missing', () => {
        const header = 'No,Pair,Side,Role,Filled Price,Filled Amount,Fee,Fee Currency,Date';
        const csv = `${header}\n1007,ETH_USDT,buy,taker,3000,2.0,3,USDT,2025-06-01 12:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].sentAmount).toBe(6000);
    });

    it('handles invalid pair', () => {
        const csv = `${HEADER}\n1008,INVALID,buy,taker,100,1.0,100,0.1,USDT,2025-01-01 00:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Invalid pair');
    });

    it('handles invalid date', () => {
        const csv = `${HEADER}\n1009,BTC_USDT,buy,taker,50000,1.0,50000,50,USDT,bad_date`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Invalid date');
    });

    it('handles invalid amount', () => {
        const csv = `${HEADER}\n1010,BTC_USDT,buy,taker,50000,0,0,50,USDT,2025-01-01 00:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Invalid amount');
    });

    it('handles empty CSV', () => {
        const result = parseGateCsv('');
        expect(result.transactions).toHaveLength(0);
        expect(result.summary.format).toBe('gate');
    });

    it('sorts by timestamp', () => {
        const csv = `${HEADER}
1011,BTC_USDT,buy,taker,50000,1.0,50000,50,USDT,2025-03-01 12:00:00
1012,ETH_USDT,sell,maker,3000,2.0,6000,6,USDT,2025-01-01 08:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].type).toBe('SELL'); // earlier
        expect(result.transactions[1].type).toBe('BUY');
    });

    it('handles zero fee', () => {
        const csv = `${HEADER}\n1013,BTC_USDT,buy,taker,50000,1.0,50000,0,USDT,2025-01-15 10:30:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].feeAmount).toBeUndefined();
    });

    it('handles fee in non-fiat currency', () => {
        const csv = `${HEADER}\n1014,ETH_BTC,buy,taker,0.05,10.0,0.5,0.01,ETH,2025-03-01 12:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.feeAmount).toBe(0.01);
        expect(tx.feeAsset).toBe('ETH');
        expect(tx.feeValueUsd).toBeUndefined();
    });

    it('provides correct summary', () => {
        const csv = `${HEADER}
1015,BTC_USDT,buy,taker,50000,1.0,50000,50,USDT,2025-01-15 10:30:00
1016,ETH_USDT,sell,maker,3000,2.0,6000,6,USDT,2025-01-15 10:35:00`;
        const result = parseGateCsv(csv);

        expect(result.summary.totalRows).toBe(2);
        expect(result.summary.parsed).toBe(2);
        expect(result.summary.failed).toBe(0);
        expect(result.summary.format).toBe('gate');
    });

    it('handles USDC as fiat-like quote', () => {
        const csv = `${HEADER}\n1017,SOL_USDC,buy,taker,150,10.0,1500,1.5,USDC,2025-05-01 00:00:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('BUY');
        expect(result.transactions[0].receivedValueUsd).toBe(1500);
    });

    it('handles negative fee', () => {
        const csv = `${HEADER}\n1018,BTC_USDT,buy,taker,50000,1.0,50000,-50,USDT,2025-01-15 10:30:00`;
        const result = parseGateCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].feeAmount).toBe(50);
    });

    it('works via unified parseCsv', () => {
        const csv = `${HEADER}\n1019,BTC_USDT,buy,taker,50000,1.0,50000,50,USDT,2025-01-15 10:30:00`;
        const result = parseCsv(csv);

        expect(result.summary.format).toBe('gate');
        expect(result.transactions).toHaveLength(1);
    });
});
