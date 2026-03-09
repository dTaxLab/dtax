/**
 * Gemini CSV Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseGeminiCsv, isGeminiCsv } from '../parsers/gemini';
import { parseCsv, detectCsvFormat } from '../parsers';

describe('isGeminiCsv', () => {
    it('detects Gemini format by header', () => {
        const csv = 'Date,Time (UTC),Type,Symbol,Specification,Liquidity Indicator,Trading Fee Rate (bps),USD Amount ($),Trading Fee (USD) ($),USD Balance ($),BTC Amount (BTC),Trading Fee (BTC) (BTC),BTC Balance (BTC)\n';
        expect(isGeminiCsv(csv)).toBe(true);
    });

    it('rejects non-Gemini format', () => {
        expect(isGeminiCsv('Timestamp,Transaction Type,Asset,Quantity Transacted')).toBe(false);
    });
});

describe('detectCsvFormat', () => {
    it('auto-detects Gemini', () => {
        const csv = 'Date,Time (UTC),Type,Symbol,Specification,Liquidity Indicator,Trading Fee Rate (bps),USD Amount ($)\n';
        expect(detectCsvFormat(csv)).toBe('gemini');
    });
});

describe('parseGeminiCsv', () => {
    const HEADER = 'Date,Time (UTC),Type,Symbol,Specification,Liquidity Indicator,Trading Fee Rate (bps),USD Amount ($),Trading Fee (USD) ($),USD Balance ($),BTC Amount (BTC),Trading Fee (BTC) (BTC),BTC Balance (BTC)';

    it('parses a Buy trade', () => {
        const csv = `${HEADER}
2025-01-15,10:30:00,Buy,BTCUSD,Limit,Maker,25,-50000.00,12.50,10000.00,1.00000000,,11.00000000`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('BUY');
        expect(tx.receivedAsset).toBe('BTC');
        expect(tx.receivedAmount).toBe(1);
        expect(tx.sentAsset).toBe('USD');
        expect(tx.sentAmount).toBe(50000);
        expect(tx.receivedValueUsd).toBe(50000);
        expect(tx.feeAmount).toBe(12.5);
        expect(tx.feeAsset).toBe('USD');
    });

    it('parses a Sell trade', () => {
        const csv = `${HEADER}
2025-02-20,14:00:00,Sell,BTCUSD,Market,Taker,35,45000.00,15.75,55000.00,-0.50000000,,10.50000000`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('SELL');
        expect(tx.sentAsset).toBe('BTC');
        expect(tx.sentAmount).toBe(0.5);
        expect(tx.receivedAsset).toBe('USD');
        expect(tx.receivedAmount).toBe(45000);
        expect(tx.sentValueUsd).toBe(45000);
    });

    it('parses a Credit (deposit)', () => {
        const csv = `${HEADER}
2025-01-01,08:00:00,Credit,,,,,10000.00,,,,,`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRANSFER_IN');
        expect(tx.receivedAsset).toBe('USD');
        expect(tx.receivedAmount).toBe(10000);
    });

    it('parses a Debit (withdrawal)', () => {
        const csv = `${HEADER}
2025-03-01,12:00:00,Debit,,,,,-5000.00,,,,,`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRANSFER_OUT');
        expect(tx.sentAsset).toBe('USD');
        expect(tx.sentAmount).toBe(5000);
    });

    it('parses BTC deposit (Credit)', () => {
        const csv = `${HEADER}
2025-01-10,09:00:00,Credit,,,,,,,,2.00000000,,12.00000000`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRANSFER_IN');
        expect(tx.receivedAsset).toBe('BTC');
        expect(tx.receivedAmount).toBe(2);
    });

    it('parses Interest Credit', () => {
        const csv = `${HEADER}
2025-04-01,00:00:00,Interest Credit,,,,,,,,0.00010000,,12.00010000`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('INTEREST');
        expect(tx.receivedAsset).toBe('BTC');
        expect(tx.receivedAmount).toBe(0.0001);
    });

    it('handles invalid date gracefully', () => {
        const csv = `${HEADER}
not-a-date,bad-time,Buy,BTCUSD,Limit,Maker,25,-50000.00,12.50,10000.00,1.00000000,,11.00000000`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Invalid date');
    });

    it('handles empty CSV', () => {
        const result = parseGeminiCsv('');
        expect(result.transactions).toHaveLength(0);
        expect(result.summary.format).toBe('gemini');
    });

    it('sorts transactions by timestamp', () => {
        const csv = `${HEADER}
2025-03-01,12:00:00,Buy,BTCUSD,Limit,Maker,25,-50000.00,12.50,10000.00,1.00000000,,11.00000000
2025-01-01,08:00:00,Credit,,,,,10000.00,,,,,`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].type).toBe('TRANSFER_IN');
        expect(result.transactions[1].type).toBe('BUY');
    });

    it('parses mixed transaction types', () => {
        const csv = `${HEADER}
2025-01-01,08:00:00,Credit,,,,,10000.00,,,,,
2025-01-15,10:30:00,Buy,BTCUSD,Limit,Maker,25,-50000.00,12.50,10000.00,1.00000000,,11.00000000
2025-02-20,14:00:00,Sell,BTCUSD,Market,Taker,35,45000.00,15.75,55000.00,-0.50000000,,10.50000000
2025-03-01,12:00:00,Debit,,,,,-5000.00,,,,,`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(4);
        expect(result.summary.parsed).toBe(4);
        expect(result.summary.format).toBe('gemini');
    });

    it('works via unified parseCsv entry point', () => {
        const csv = `${HEADER}
2025-01-15,10:30:00,Buy,BTCUSD,Limit,Maker,25,-50000.00,12.50,10000.00,1.00000000,,11.00000000`;
        const result = parseCsv(csv);

        expect(result.summary.format).toBe('gemini');
        expect(result.transactions).toHaveLength(1);
    });

    it('handles ETH trading pair', () => {
        const header = 'Date,Time (UTC),Type,Symbol,Specification,Liquidity Indicator,Trading Fee Rate (bps),USD Amount ($),Trading Fee (USD) ($),USD Balance ($),ETH Amount (ETH),Trading Fee (ETH) (ETH),ETH Balance (ETH)';
        const csv = `${header}
2025-01-20,16:00:00,Buy,ETHUSD,Limit,Maker,25,-3000.00,7.50,7000.00,1.50000000,,5.50000000`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('BUY');
        expect(tx.receivedAsset).toBe('ETH');
        expect(tx.receivedAmount).toBe(1.5);
        expect(tx.sentAsset).toBe('USD');
        expect(tx.sentAmount).toBe(3000);
    });

    it('handles Administrative Credit as airdrop', () => {
        const csv = `${HEADER}
2025-05-01,00:00:00,Administrative Credit,,,,,,,,0.05000000,,12.05000000`;
        const result = parseGeminiCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('AIRDROP');
        expect(result.transactions[0].receivedAsset).toBe('BTC');
    });

    it('provides correct summary', () => {
        const csv = `${HEADER}
2025-01-01,08:00:00,Credit,,,,,10000.00,,,,,
2025-01-15,10:30:00,Buy,BTCUSD,Limit,Maker,25,-50000.00,12.50,10000.00,1.00000000,,11.00000000`;
        const result = parseGeminiCsv(csv);

        expect(result.summary.totalRows).toBe(2);
        expect(result.summary.parsed).toBe(2);
        expect(result.summary.failed).toBe(0);
        expect(result.summary.format).toBe('gemini');
    });
});
