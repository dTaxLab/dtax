/**
 * Tests for 1099-DA reconciliation engine.
 */

import { describe, it, expect } from 'vitest';
import { parse1099DA, reconcile } from '../reconciliation';
import type { Form1099DAEntry, DtaxDisposition } from '../reconciliation';

// ─── Parser Tests ────────────────────────────────

describe('1099-DA Parser', () => {
    it('should parse generic format CSV', () => {
        const csv = [
            'asset,date_sold,date_acquired,gross_proceeds,cost_basis,gain_loss,transaction_id',
            'BTC,2025-03-15,2024-01-10,45000,30000,15000,tx-001',
            'ETH,2025-06-20,2024-06-01,3500,2000,1500,tx-002',
        ].join('\n');

        const result = parse1099DA(csv, 'Coinbase', 2025);

        expect(result.entries).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
        expect(result.brokerName).toBe('Coinbase');
        expect(result.taxYear).toBe(2025);

        const btc = result.entries[0];
        expect(btc.asset).toBe('BTC');
        expect(btc.grossProceeds).toBe(45000);
        expect(btc.costBasis).toBe(30000);
        expect(btc.gainLoss).toBe(15000);
        expect(btc.transactionId).toBe('tx-001');
    });

    it('should parse Coinbase format CSV', () => {
        const csv = [
            'Asset Name,Date of Sale,Date Acquired,Gross Proceeds,Cost Basis,Gain/Loss,Transaction ID',
            'Bitcoin,2025-04-01,2024-02-15,$50000.00,$35000.00,$15000.00,CB-001',
        ].join('\n');

        const result = parse1099DA(csv, 'Coinbase', 2025);

        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].asset).toBe('BTC');
        expect(result.entries[0].grossProceeds).toBe(50000);
        expect(result.entries[0].costBasis).toBe(35000);
    });

    it('should normalize asset names', () => {
        const csv = [
            'asset,date_sold,gross_proceeds',
            'Bitcoin,2025-03-15,1000',
            'Ethereum,2025-03-15,500',
            'Solana,2025-03-15,200',
            'Dogecoin,2025-03-15,50',
            'Ethereum Classic,2025-03-15,30',
        ].join('\n');

        const result = parse1099DA(csv);
        expect(result.entries.map(e => e.asset)).toEqual(['BTC', 'ETH', 'SOL', 'DOGE', 'ETC']);
    });

    it('should handle missing required fields gracefully', () => {
        const csv = [
            'asset,date_sold,gross_proceeds',
            'BTC,,1000',        // missing date
            ',2025-03-15,500',  // missing asset
            'ETH,2025-03-15,',  // missing proceeds
        ].join('\n');

        const result = parse1099DA(csv);
        expect(result.entries).toHaveLength(0);
        expect(result.errors).toHaveLength(3);
    });

    it('should handle dollar signs and commas in amounts', () => {
        const csv = [
            'asset,date_sold,gross_proceeds,cost_basis',
            'BTC,2025-03-15,"$1,234.56","$987.65"',
        ].join('\n');

        const result = parse1099DA(csv);
        expect(result.entries[0].grossProceeds).toBe(1234.56);
        expect(result.entries[0].costBasis).toBe(987.65);
    });

    it('should handle entries without cost basis (pre-2027)', () => {
        const csv = [
            'asset,date_sold,gross_proceeds',
            'BTC,2025-03-15,50000',
        ].join('\n');

        const result = parse1099DA(csv);
        expect(result.entries[0].costBasis).toBeUndefined();
    });
});

// ─── Reconciler Tests ────────────────────────────

describe('Reconciliation Engine', () => {
    function makeBrokerEntry(overrides: Partial<Form1099DAEntry> = {}): Form1099DAEntry {
        return {
            rowIndex: 1,
            asset: 'BTC',
            dateSold: new Date('2025-03-15'),
            grossProceeds: 50000,
            costBasis: 30000,
            gainLoss: 20000,
            ...overrides,
        };
    }

    function makeDtaxEntry(overrides: Partial<DtaxDisposition> = {}): DtaxDisposition {
        return {
            eventId: 'evt-1',
            asset: 'BTC',
            dateSold: new Date('2025-03-15'),
            proceeds: 50000,
            costBasis: 30000,
            gainLoss: 20000,
            ...overrides,
        };
    }

    it('should match identical entries as "matched"', () => {
        const report = reconcile(
            [makeBrokerEntry()],
            [makeDtaxEntry()],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        expect(report.summary.matched).toBe(1);
        expect(report.summary.totalBrokerEntries).toBe(1);
        expect(report.summary.totalDtaxDispositions).toBe(1);
        expect(report.items[0].status).toBe('matched');
        expect(report.items[0].rebuttalSuggestion).toBeUndefined();
    });

    it('should detect proceeds mismatch', () => {
        const report = reconcile(
            [makeBrokerEntry({ grossProceeds: 51000 })],
            [makeDtaxEntry()],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        // Fuzzy match should pick it up (within 5%)
        expect(report.items[0].status).toBe('proceeds_mismatch');
        expect(report.items[0].proceedsDiff).toBe(1000);
        expect(report.items[0].rebuttalSuggestion).toContain('Proceeds differ');
    });

    it('should detect cost basis mismatch', () => {
        const report = reconcile(
            [makeBrokerEntry({ grossProceeds: 50000, costBasis: 25000, gainLoss: 25000 })],
            [makeDtaxEntry()],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        expect(report.items[0].status).toBe('basis_mismatch');
        expect(report.items[0].costBasisDiff).toBe(-5000);
        expect(report.items[0].rebuttalSuggestion).toContain('Cost basis differs');
    });

    it('should identify missing entries in DTax', () => {
        const report = reconcile(
            [makeBrokerEntry(), makeBrokerEntry({ asset: 'ETH', grossProceeds: 3000 })],
            [makeDtaxEntry()],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        expect(report.summary.matched).toBe(1);
        expect(report.summary.missingInDtax).toBe(1);
        const missing = report.items.find(i => i.status === 'missing_in_dtax');
        expect(missing?.brokerEntry?.asset).toBe('ETH');
        expect(missing?.rebuttalSuggestion).toContain('not found in your records');
    });

    it('should identify missing entries in 1099-DA', () => {
        const report = reconcile(
            [makeBrokerEntry()],
            [makeDtaxEntry(), makeDtaxEntry({ eventId: 'evt-2', asset: 'SOL', proceeds: 200 })],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        expect(report.summary.matched).toBe(1);
        expect(report.summary.missingIn1099da).toBe(1);
        const missing = report.items.find(i => i.status === 'missing_in_1099da');
        expect(missing?.dtaxEntry?.asset).toBe('SOL');
        expect(missing?.rebuttalSuggestion).toContain('Box C');
    });

    it('should detect internal transfer misclassification', () => {
        const report = reconcile(
            [makeBrokerEntry({ transactionId: 'transfer-001' })],
            [],
            {
                taxYear: 2025,
                brokerName: 'Coinbase',
                internalTransferIds: new Set(['transfer-001']),
            },
        );

        expect(report.summary.internalTransferMisclassified).toBe(1);
        expect(report.items[0].status).toBe('internal_transfer_misclassified');
        expect(report.items[0].rebuttalSuggestion).toContain('internal transfer');
    });

    it('should fuzzy match entries within date tolerance', () => {
        const report = reconcile(
            [makeBrokerEntry({ dateSold: new Date('2025-03-16') })], // 1 day off
            [makeDtaxEntry()],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        // Should fuzzy match (same asset, ±2 days, same proceeds)
        expect(report.items[0].status).toBe('matched');
    });

    it('should compute summary totals correctly', () => {
        const report = reconcile(
            [
                makeBrokerEntry({ grossProceeds: 50000 }),
                makeBrokerEntry({ asset: 'ETH', grossProceeds: 3000, costBasis: 2000, gainLoss: 1000 }),
            ],
            [
                makeDtaxEntry({ proceeds: 50000 }),
                makeDtaxEntry({ eventId: 'evt-2', asset: 'ETH', proceeds: 3100, costBasis: 2000, gainLoss: 1100 }),
            ],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        expect(report.summary.totalBrokerEntries).toBe(2);
        expect(report.summary.totalDtaxDispositions).toBe(2);
        // BTC matches exactly, ETH has proceeds mismatch
        expect(report.summary.matched).toBe(1);
        expect(report.summary.proceedsMismatch).toBe(1);
        expect(report.summary.netProceedsDiff).toBe(-100); // 3000 - 3100
    });

    it('should handle empty inputs gracefully', () => {
        const report = reconcile([], [], { taxYear: 2025, brokerName: 'Test' });

        expect(report.items).toHaveLength(0);
        expect(report.summary.matched).toBe(0);
        expect(report.summary.totalBrokerEntries).toBe(0);
    });

    it('should not double-match entries', () => {
        // Two identical broker entries should match two different DTax entries
        const report = reconcile(
            [
                makeBrokerEntry({ grossProceeds: 50000 }),
                makeBrokerEntry({ grossProceeds: 50000 }),
            ],
            [
                makeDtaxEntry({ eventId: 'evt-1', proceeds: 50000 }),
                makeDtaxEntry({ eventId: 'evt-2', proceeds: 50000 }),
            ],
            { taxYear: 2025, brokerName: 'Coinbase' },
        );

        expect(report.summary.matched).toBe(2);
        expect(report.items).toHaveLength(2);
        // Each DTax entry matched to a different broker entry
        const dtaxIds = report.items.map(i => i.dtaxEntry?.eventId);
        expect(new Set(dtaxIds).size).toBe(2);
    });
});
