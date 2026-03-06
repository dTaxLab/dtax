/**
 * FIFO (First In, First Out) Tax Calculation Method.
 *
 * The earliest acquired assets are considered sold first.
 * This is the default method used by most tax authorities (including IRS).
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

/**
 * Determine holding period based on acquisition and sale dates.
 */
function getHoldingPeriod(acquiredAt: Date, soldAt: Date): HoldingPeriod {
    const holdingMs = soldAt.getTime() - acquiredAt.getTime();
    return holdingMs >= ONE_YEAR_MS ? 'LONG_TERM' : 'SHORT_TERM';
}

/**
 * Calculate capital gains/losses using the FIFO method.
 *
 * @param lots - Available tax lots, sorted by acquisition date (ascending)
 * @param event - The taxable event (sale/trade)
 * @returns CalculationResult with gains/losses and matched lots
 *
 * @example
 * ```typescript
 * const lots = [
 *   { id: '1', asset: 'BTC', amount: 1.0, costBasisUsd: 30000, acquiredAt: new Date('2024-01-01') },
 *   { id: '2', asset: 'BTC', amount: 0.5, costBasisUsd: 20000, acquiredAt: new Date('2024-06-01') },
 * ];
 * const sale = { id: 's1', asset: 'BTC', amount: 1.2, proceedsUsd: 60000, date: new Date('2025-06-01') };
 * const result = calculateFIFO(lots, sale);
 * // result.gainLoss = proceeds - costBasis of consumed lots
 * ```
 */
export function calculateFIFO(
    lots: TaxLot[],
    event: TaxableEvent
): CalculationResult {
    // Sort lots by acquisition date (ascending) for FIFO
    const sortedLots = [...lots]
        .filter((lot) => lot.asset === event.asset && lot.amount > 0)
        .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

    let remainingAmount = event.amount;
    let totalCostBasis = 0;
    const matchedLots: MatchedLot[] = [];
    let earliestLotDate: Date | null = null;

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

        if (!earliestLotDate) {
            earliestLotDate = lot.acquiredAt;
        }
    }

    if (remainingAmount > 0.00000001) {
        // Floating point tolerance
        console.warn(
            `[DTax FIFO] Insufficient lots for ${event.asset}: ` +
            `needed ${event.amount}, matched ${event.amount - remainingAmount}`
        );
    }

    const feeUsd = event.feeUsd ?? 0;
    const gainLoss = event.proceedsUsd - totalCostBasis - feeUsd;
    const holdingPeriod = earliestLotDate
        ? getHoldingPeriod(earliestLotDate, event.date)
        : 'SHORT_TERM';

    return {
        event,
        matchedLots,
        gainLoss,
        holdingPeriod,
        method: 'FIFO',
    };
}
