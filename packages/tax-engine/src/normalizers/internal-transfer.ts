/**
 * Internal Transfer Normalizer
 *
 * This engine detects and matches 'TRANSFER_OUT' and 'TRANSFER_IN' events
 * between the user's isolated wallets/exchanges. This is critical for the
 * IRS 2025/2026 "Wallet-by-Wallet" cost basis requirement. 
 * Instead of treating a 'TRANSFER_OUT' as a zero-cost taxable 'SELL', 
 * this normalizer ties the origin cost basis directly to the destination.
 *
 * @license AGPL-3.0
 */

export interface TransferRecord {
    id: string;
    sourceId: string;
    type: 'TRANSFER_IN' | 'TRANSFER_OUT';
    timestamp: Date;
    asset: string;
    amount: number;
    feeAsset?: string;
    feeAmount?: number;
    originalTx?: any; // To hold the full DB object if needed
}

export interface InternalTransferMatch {
    outTx: TransferRecord;
    inTx: TransferRecord;
}

export interface MatchResult {
    matched: InternalTransferMatch[];
    unmatchedOut: TransferRecord[];
    unmatchedIn: TransferRecord[];
}

/**
 * Match transfers between wallets/exchanges to avoid treating them as taxable events.
 * 
 * @param transfers - Flat array of all Transfer IN and OUT events.
 * @param maxTimeWindowMs - Maximum delay between an out and an in operation. (Default: 24h)
 */
export function matchInternalTransfers(
    transfers: TransferRecord[],
    maxTimeWindowMs: number = 24 * 60 * 60 * 1000
): MatchResult {
    // Sort all transfers chronologically
    const outs = transfers
        .filter((t) => t.type === 'TRANSFER_OUT')
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const ins = transfers
        .filter((t) => t.type === 'TRANSFER_IN')
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const matched: InternalTransferMatch[] = [];
    const usedIns = new Set<string>();

    for (const outTx of outs) {
        let bestMatch: TransferRecord | null = null;
        let smallestAmountDiff = Infinity;
        let smallestTimeDiff = Infinity;

        for (const inTx of ins) {
            // Skip if already assigned or wrong asset
            if (usedIns.has(inTx.id)) continue;
            if (inTx.asset !== outTx.asset) continue;

            // Check time bounds: 'IN' usually happens after or very close to 'OUT'
            const timeDiff = inTx.timestamp.getTime() - outTx.timestamp.getTime();
            if (timeDiff < -60000) continue; // Allow up to 1m clock skew backwards
            if (timeDiff > maxTimeWindowMs) continue; // Too far in the future

            // The IN amount should not be strictly greater than OUT amount
            // (Unless it's an error. We allow tiny floating point tolerance)
            const amountDiff = outTx.amount - inTx.amount;
            if (amountDiff >= -0.00000001) {
                // We prefer exact matches (amountDiff == 0),
                // otherwise we prefer the smallest amount diff (deducted network fee)
                // If amount diff is equal (within tolerance), we prefer closer time jump.
                if (
                    amountDiff < smallestAmountDiff ||
                    (Math.abs(amountDiff - smallestAmountDiff) < 0.00000001 &&
                        timeDiff < smallestTimeDiff)
                ) {
                    smallestAmountDiff = amountDiff;
                    smallestTimeDiff = timeDiff;
                    bestMatch = inTx;
                }
            }
        }

        if (bestMatch) {
            matched.push({ outTx, inTx: bestMatch });
            usedIns.add(bestMatch.id);
        }
    }

    const unmatchedOut = outs.filter((t) => !matched.some((m) => m.outTx.id === t.id));
    const unmatchedIn = ins.filter((t) => !usedIns.has(t.id));

    return { matched, unmatchedOut, unmatchedIn };
}
