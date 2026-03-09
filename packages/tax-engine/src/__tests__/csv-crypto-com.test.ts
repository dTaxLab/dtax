/**
 * Crypto.com CSV Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseCryptoComCsv, isCryptoComCsv } from '../parsers/crypto-com';
import { parseCsv, detectCsvFormat } from '../parsers';

describe('isCryptoComCsv', () => {
    it('detects newer format by header', () => {
        const csv = 'Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash\n';
        expect(isCryptoComCsv(csv)).toBe(true);
    });

    it('detects app format by header', () => {
        const csv = 'Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind\n';
        expect(isCryptoComCsv(csv)).toBe(true);
    });

    it('rejects non-Crypto.com format', () => {
        expect(isCryptoComCsv('Timestamp,Transaction Type,Asset,Quantity Transacted')).toBe(false);
    });
});

describe('detectCsvFormat', () => {
    it('auto-detects Crypto.com newer format', () => {
        const csv = 'Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash\n';
        expect(detectCsvFormat(csv)).toBe('crypto_com');
    });
});

describe('parseCryptoComCsv — newer format', () => {
    const HEADER = 'Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash';

    it('parses a buy transaction', () => {
        const csv = `${HEADER}
2025-01-15 10:30:00,,,1.5,BTC,0.01,BTC,45000,USD,crypto_purchase,Buy BTC,0xabc`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('BUY');
        expect(tx.receivedAsset).toBe('BTC');
        expect(tx.receivedAmount).toBe(1.5);
    });

    it('parses a sell transaction', () => {
        const csv = `${HEADER}
2025-02-20 14:00:00,0.5,BTC,,,,,25000,USD,crypto_sale,Sell BTC,0xdef`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('SELL');
        expect(tx.sentAsset).toBe('BTC');
        expect(tx.sentAmount).toBe(0.5);
        expect(tx.sentValueUsd).toBe(25000);
    });

    it('parses a deposit', () => {
        const csv = `${HEADER}
2025-01-01 08:00:00,,,2.0,ETH,,,3000,USD,crypto_deposit,Deposit ETH,0x123`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRANSFER_IN');
        expect(tx.receivedAsset).toBe('ETH');
        expect(tx.receivedAmount).toBe(2);
    });

    it('parses a withdrawal', () => {
        const csv = `${HEADER}
2025-03-01 12:00:00,1.0,BTC,,,0.0001,BTC,,,crypto_withdrawal,Withdrawal BTC,0x456`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRANSFER_OUT');
        expect(tx.sentAsset).toBe('BTC');
        expect(tx.sentAmount).toBe(1);
        expect(tx.feeAsset).toBe('BTC');
        expect(tx.feeAmount).toBe(0.0001);
    });

    it('parses a staking reward', () => {
        const csv = `${HEADER}
2025-04-01 00:00:00,,,0.001,CRO,,,0.50,USD,reward,Staking reward,`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('STAKING_REWARD');
        expect(tx.receivedAsset).toBe('CRO');
        expect(tx.receivedAmount).toBe(0.001);
    });

    it('parses an interest payment', () => {
        const csv = `${HEADER}
2025-05-01 00:00:00,,,0.0005,BTC,,,20,USD,interest,Interest paid,`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('INTEREST');
    });

    it('handles invalid date', () => {
        const csv = `${HEADER}
bad-date,0.5,BTC,,,,25000,USD,,sell,Sell BTC,`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
    });

    it('handles empty CSV', () => {
        const result = parseCryptoComCsv('');
        expect(result.transactions).toHaveLength(0);
        expect(result.summary.format).toBe('crypto_com');
    });

    it('sorts by timestamp', () => {
        const csv = `${HEADER}
2025-03-01 12:00:00,1.0,BTC,,,,,,,crypto_withdrawal,Withdrawal,
2025-01-01 08:00:00,,,2.0,ETH,,,3000,USD,crypto_deposit,Deposit,`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].type).toBe('TRANSFER_IN');
        expect(result.transactions[1].type).toBe('TRANSFER_OUT');
    });

    it('includes description as notes', () => {
        const csv = `${HEADER}
2025-01-15 10:30:00,,,1.0,BTC,,,45000,USD,crypto_purchase,Buy BTC via card,`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions[0].notes).toBe('Buy BTC via card');
    });
});

describe('parseCryptoComCsv — app format', () => {
    const HEADER = 'Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind';

    it('parses a crypto purchase', () => {
        const csv = `${HEADER}
2025-01-15 10:30:00,Buy BTC,BTC,0.5,,,USD,25000,25000,crypto_purchase`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('BUY');
        expect(tx.receivedAsset).toBe('BTC');
        expect(tx.receivedAmount).toBe(0.5);
        expect(tx.receivedValueUsd).toBe(25000);
    });

    it('parses a crypto withdrawal', () => {
        const csv = `${HEADER}
2025-02-01 12:00:00,Withdraw BTC,BTC,-0.3,,,USD,15000,15000,crypto_withdrawal`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRANSFER_OUT');
        expect(tx.sentAsset).toBe('BTC');
        expect(tx.sentAmount).toBe(0.3);
    });

    it('parses an exchange (trade with To Currency)', () => {
        const csv = `${HEADER}
2025-03-15 09:00:00,Exchange BTC to ETH,BTC,-0.1,ETH,1.5,USD,5000,5000,crypto_exchange`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        const tx = result.transactions[0];
        expect(tx.type).toBe('TRADE');
        expect(tx.sentAsset).toBe('BTC');
        expect(tx.sentAmount).toBe(0.1);
        expect(tx.receivedAsset).toBe('ETH');
        expect(tx.receivedAmount).toBe(1.5);
    });

    it('parses an earn interest payment', () => {
        const csv = `${HEADER}
2025-04-01 00:00:00,Crypto Earn Interest,BTC,0.0005,,,USD,20,20,crypto_earn_interest_paid`;
        const result = parseCryptoComCsv(csv);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].type).toBe('INTEREST');
        expect(result.transactions[0].receivedAsset).toBe('BTC');
    });

    it('provides correct summary', () => {
        const csv = `${HEADER}
2025-01-15 10:30:00,Buy BTC,BTC,0.5,,,USD,25000,25000,crypto_purchase
2025-02-01 12:00:00,Withdraw BTC,BTC,-0.3,,,USD,15000,15000,crypto_withdrawal`;
        const result = parseCryptoComCsv(csv);

        expect(result.summary.totalRows).toBe(2);
        expect(result.summary.parsed).toBe(2);
        expect(result.summary.failed).toBe(0);
        expect(result.summary.format).toBe('crypto_com');
    });
});

describe('parseCsv integration', () => {
    it('works via unified parseCsv for newer format', () => {
        const csv = `Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash
2025-01-15 10:30:00,,,1.0,BTC,,,45000,USD,crypto_purchase,Buy BTC,`;
        const result = parseCsv(csv);

        expect(result.summary.format).toBe('crypto_com');
        expect(result.transactions).toHaveLength(1);
    });
});
