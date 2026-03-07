/**
 * LIFO (Last In, First Out) Tax Calculation Method.
 *
 * The most recently acquired assets are considered sold first.
 * This method may result in more short-term capital gains since
 * newer lots are consumed first.
 *
 * @license AGPL-3.0
 */

import type {
    TaxLot,
    TaxableEvent,
    CalculationResult,
    MatchedLot,
    HoldingPeriod,
} from '../types';

const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function getHoldingPeriod(acquiredAt: Date, soldAt: Date): HoldingPeriod {
    const holdingMs = soldAt.getTime() - acquiredAt.getTime();
    return holdingMs >= ONE_YEAR_MS ? 'LONG_TERM' : 'SHORT_TERM';
}

/**
 * Calculate capital gains/losses using the LIFO method.
 *
 * @param lots - Available tax lots (will be sorted by acquisition date DESCENDING)
 * @param event - The taxable event (sale/trade)
 * @returns CalculationResult with gains/losses and matched lots
 */
export function calculateLIFO(
    lots: TaxLot[],
    event: TaxableEvent
): CalculationResult {
    // Sort lots by acquisition date DESCENDING for LIFO (newest first)
    const sortedLots = [...lots]
        .filter((lot) => lot.asset === event.asset && lot.amount > 0)
        .sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime());

    let remainingAmount = event.amount;
    let totalCostBasis = 0;
    const matchedLots: MatchedLot[] = [];
    let earliestMatchedDate: Date | null = null;

    for (const lot of sortedLots) {
        if (remainingAmount <= 0) break;

        const consumeAmount = Math.min(lot.amount, remainingAmount);
        const costPerUnit = lot.costBasisUsd / lot.amount;
        const consumedCostBasis = costPerUnit * consumeAmount;

        matchedLots.push({
            lotId: lot.id,
            amountConsumed: consumeAmount,
            costBasisUsd: consumedCostBasis,
            fullyConsumed: consumeAmount >= lot.amount,
        });

        totalCostBasis += consumedCostBasis;
        remainingAmount -= consumeAmount;

        // Track the earliest matched lot for holding period
        if (!earliestMatchedDate || lot.acquiredAt < earliestMatchedDate) {
            earliestMatchedDate = lot.acquiredAt;
        }
    }

    if (remainingAmount > 0.00000001) {
        console.warn(
            `[DTax LIFO] Insufficient lots for ${event.asset}: ` +
            `needed ${event.amount}, matched ${event.amount - remainingAmount}`
        );
    }

    const feeUsd = event.feeUsd ?? 0;
    const gainLoss = event.proceedsUsd - totalCostBasis - feeUsd;
    const holdingPeriod = earliestMatchedDate
        ? getHoldingPeriod(earliestMatchedDate, event.date)
        : 'SHORT_TERM';

    return {
        event,
        matchedLots,
        gainLoss,
        holdingPeriod,
        method: 'LIFO',
    };
}
