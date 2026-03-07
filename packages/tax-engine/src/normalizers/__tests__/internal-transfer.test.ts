import { describe, it, expect } from 'vitest';
import { matchInternalTransfers, TransferRecord } from '../internal-transfer';

describe('Internal Transfer Normalizer', () => {
    const baseOut: TransferRecord = {
        id: 'out-1',
        sourceId: 'binance-1',
        type: 'TRANSFER_OUT',
        asset: 'ETH',
        amount: 1.0,
        timestamp: new Date('2025-01-01T10:00:00Z'),
    };

    const baseIn: TransferRecord = {
        id: 'in-1',
        sourceId: 'metamask-1',
        type: 'TRANSFER_IN',
        asset: 'ETH',
        amount: 1.0,
        timestamp: new Date('2025-01-01T10:05:00Z'),
    };

    it('should perfectly match an identical transfer within the time window', () => {
        const result = matchInternalTransfers([baseOut, baseIn]);

        expect(result.matched).toHaveLength(1);
        expect(result.matched[0].outTx.id).toBe('out-1');
        expect(result.matched[0].inTx.id).toBe('in-1');
        expect(result.unmatchedOut).toHaveLength(0);
        expect(result.unmatchedIn).toHaveLength(0);
    });

    it('should match even if the received amount is slightly less (deducted network fee)', () => {
        const outTx = { ...baseOut, amount: 1.01 }; // Sent 1.01 ETH
        const inTx = { ...baseIn, amount: 1.00 }; // Received 1.00 ETH

        const result = matchInternalTransfers([outTx, inTx]);
        expect(result.matched).toHaveLength(1);
        expect(result.matched[0].outTx.amount).toBe(1.01);
        expect(result.matched[0].inTx.amount).toBe(1.00);
    });

    it('should prefer a closer chronological match if amounts are equal', () => {
        const outTx = { ...baseOut };
        const inOneHour = { ...baseIn, id: 'in-1h', timestamp: new Date('2025-01-01T11:00:00Z') };
        const inFiveMins = { ...baseIn, id: 'in-5m', timestamp: new Date('2025-01-01T10:05:00Z') };

        const result = matchInternalTransfers([outTx, inOneHour, inFiveMins]);

        expect(result.matched).toHaveLength(1);
        expect(result.matched[0].inTx.id).toBe('in-5m'); // Preferred the closer one
        expect(result.unmatchedIn).toHaveLength(1);      // The 1h one remains unmatched
        expect(result.unmatchedIn[0].id).toBe('in-1h');
    });

    it('should reject matches outside the maximum time window', () => {
        const outTx = { ...baseOut };
        // 25 hours later
        const inTx = { ...baseIn, timestamp: new Date('2025-01-02T11:00:00Z') };

        const result = matchInternalTransfers([outTx, inTx]);

        expect(result.matched).toHaveLength(0);
        expect(result.unmatchedOut).toHaveLength(1);
        expect(result.unmatchedIn).toHaveLength(1);
    });

    it('should ignore negative time jumps beyond 1 minute skew', () => {
        const outTx = { ...baseOut, timestamp: new Date('2025-01-01T10:00:00Z') };
        // Received 5 mins before sending logically impossible without huge clock skew
        const inTx = { ...baseIn, timestamp: new Date('2025-01-01T09:55:00Z') };

        const result = matchInternalTransfers([outTx, inTx]);

        expect(result.matched).toHaveLength(0);
    });

    it('should correctly handle multiple disjoint transfers', () => {
        const transfers: TransferRecord[] = [
            { ...baseOut, id: 'out-1', asset: 'BTC', amount: 0.5 },
            { ...baseIn, id: 'in-1', asset: 'BTC', amount: 0.5, timestamp: new Date('2025-01-01T10:30:00Z') },

            { ...baseOut, id: 'out-2', asset: 'ETH', amount: 10, timestamp: new Date('2025-02-01T10:00:00Z') },
            { ...baseIn, id: 'in-2', asset: 'ETH', amount: 9.9, timestamp: new Date('2025-02-01T10:05:00Z') },

            // Unmatched isolated
            { ...baseOut, id: 'out-unmatched', asset: 'SOL', amount: 100 },
            { ...baseIn, id: 'in-unmatched', asset: 'USDC', amount: 50 },
        ];

        const result = matchInternalTransfers(transfers);
        expect(result.matched).toHaveLength(2);

        const matchedOutIds = result.matched.map(m => m.outTx.id);
        expect(matchedOutIds).toContain('out-1');
        expect(matchedOutIds).toContain('out-2');

        expect(result.unmatchedOut).toHaveLength(1);
        expect(result.unmatchedOut[0].id).toBe('out-unmatched');

        expect(result.unmatchedIn).toHaveLength(1);
        expect(result.unmatchedIn[0].id).toBe('in-unmatched');
    });
});
