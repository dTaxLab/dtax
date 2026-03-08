/**
 * CLI library functions.
 * Extracted for testability — pure functions with no side effects.
 *
 * @license AGPL-3.0
 */

import type { TaxLot, TaxableEvent, ParsedTransaction } from '@dtax/tax-engine';

/** Parse CLI arguments into command, file, and flags */
export function parseArgs(args: string[]): { command: string; file?: string; flags: Record<string, string> } {
    const flags: Record<string, string> = {};
    let command = '';
    let file: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = 'true';
            }
        } else if (!command) {
            command = arg;
        } else if (!file) {
            file = arg;
        }
    }

    return { command, file, flags };
}

/** Map a ParsedTransaction to a TaxLot if it's an acquisition */
export function toTaxLot(tx: ParsedTransaction, index: number): TaxLot | null {
    const t = tx.type;
    const isAcquisition = t === 'BUY' || t === 'AIRDROP' || t === 'STAKING_REWARD' ||
        t === 'MINING_REWARD' || t === 'INTEREST' || t === 'GIFT_RECEIVED' ||
        t === 'TRANSFER_IN';

    // TRADE has a received side (acquisition)
    const isTradeBuy = t === 'TRADE' && tx.receivedAsset && tx.receivedAmount;

    if (!isAcquisition && !isTradeBuy) return null;

    const asset = tx.receivedAsset;
    const amount = tx.receivedAmount;
    const costBasis = tx.receivedValueUsd ?? 0;

    if (!asset || !amount || amount <= 0) return null;

    return {
        id: `lot-${index}`,
        asset,
        amount,
        costBasisUsd: costBasis,
        acquiredAt: new Date(tx.timestamp),
        sourceId: 'csv',
    };
}

/** Map a ParsedTransaction to a TaxableEvent if it's a disposition */
export function toTaxableEvent(tx: ParsedTransaction, index: number, yearFilter?: number): TaxableEvent | null {
    const t = tx.type;
    const isDisposition = t === 'SELL' || t === 'GIFT_SENT' ||
        t === 'TRANSFER_OUT';

    // TRADE has a sent side (disposition)
    const isTradeSell = t === 'TRADE' && tx.sentAsset && tx.sentAmount;

    if (!isDisposition && !isTradeSell) return null;

    const asset = tx.sentAsset;
    const amount = tx.sentAmount;
    const proceeds = tx.sentValueUsd ?? 0;

    if (!asset || !amount || amount <= 0) return null;

    const eventDate = new Date(tx.timestamp);
    if (yearFilter && eventDate.getFullYear() !== yearFilter) return null;

    return {
        id: `evt-${index}`,
        asset,
        amount,
        proceedsUsd: proceeds,
        date: eventDate,
        feeUsd: tx.feeValueUsd ?? 0,
        sourceId: 'csv',
    };
}
