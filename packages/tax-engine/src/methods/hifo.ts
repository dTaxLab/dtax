/**
 * HIFO (Highest In, First Out) Tax Calculation Method.
 *
 * The highest cost-basis lots are consumed first, which minimizes
 * taxable gains (or maximizes losses). This is the most tax-efficient
 * method for reducing current-year tax liability.
 *
 * Note: The IRS allows HIFO via "Specific Identification" method
 * when proper records are maintained.
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
 * Calculate capital gains/losses using the HIFO method.
 *
 * @param lots - Available tax lots (will be sorted by cost-per-unit DESCENDING)
 * @param event - The taxable event (sale/trade)
 * @returns CalculationResult with gains/losses and matched lots
 */
export function calculateHIFO(
    lots: TaxLot[],
    event: TaxableEvent
): CalculationResult {
    // Sort lots by cost per unit DESCENDING (highest cost first)
    const sortedLots = [...lots]
        .filter((lot) => lot.asset === event.asset && lot.amount > 0)
        .sort((a, b) => {
            const costPerUnitA = a.costBasisUsd / a.amount;
            const costPerUnitB = b.costBasisUsd / b.amount;
            return costPerUnitB - costPerUnitA;
        });

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
            `[DTax HIFO] Insufficient lots for ${event.asset}: ` +
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
        method: 'HIFO',
    };
}
