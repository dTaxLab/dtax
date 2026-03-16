/**
 * Germany FIFO with 12-Month Tax Exemption (§23 EStG Spekulationsfrist).
 *
 * Uses FIFO lot ordering (earliest acquired first), but gains from lots
 * held longer than 12 months (365.25 days) are tax-exempt. Losses from
 * exempt lots are also not deductible.
 *
 * @license AGPL-3.0
 */

import type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  MatchedLot,
  HoldingPeriod,
} from "../types";

/**
 * Determine holding period based on acquisition and sale dates.
 */
function getHoldingPeriod(acquiredAt: Date, soldAt: Date): HoldingPeriod {
  // IRS rule: "more than one year" from the day after acquisition
  const dayAfter = new Date(acquiredAt);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const oneYearLater = new Date(dayAfter);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return soldAt >= oneYearLater ? "LONG_TERM" : "SHORT_TERM";
}

/**
 * Check if a lot qualifies for Germany's 12-month tax exemption.
 */
function isExempt(acquiredAt: Date, soldAt: Date): boolean {
  // German 1-year holding exemption: held more than 1 year
  const dayAfter = new Date(acquiredAt);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const oneYearLater = new Date(dayAfter);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return soldAt >= oneYearLater;
}

/**
 * Calculate capital gains/losses using Germany FIFO with 12-month exemption.
 *
 * Lots held > 12 months have their gain/loss zeroed out (tax-free under
 * §23 EStG). Lots are still consumed normally for tracking purposes.
 *
 * @param lots - Available tax lots
 * @param event - The taxable event (sale/trade)
 * @param strictSilo - If true, only match lots with same sourceId
 * @returns CalculationResult with gains/losses (exempt portions excluded)
 */
export function calculateGermanyFIFO(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const applicableLots = strictSilo
    ? lots.filter((l) => l.sourceId === event.sourceId)
    : lots;

  // Sort lots by acquisition date (ascending) for FIFO
  const sortedLots = [...applicableLots]
    .filter((lot) => lot.asset === event.asset && lot.amount > 0.00000001)
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

  let remainingAmount = event.amount;
  let taxableCostBasis = 0;
  let taxableProceeds = 0;
  const matchedLots: MatchedLot[] = [];
  let earliestLotDate: Date | null = null;

  for (const lot of sortedLots) {
    if (remainingAmount <= 0) break;

    const consumeAmount = Math.min(lot.amount, remainingAmount);
    const costPerUnit =
      lot.amount > 0.00000001 ? lot.costBasisUsd / lot.amount : 0;
    const consumedCostBasis = costPerUnit * consumeAmount;
    const fullyConsumed = consumeAmount >= lot.amount - 0.00000001;

    matchedLots.push({
      lotId: lot.id,
      amountConsumed: consumeAmount,
      costBasisUsd: consumedCostBasis,
      fullyConsumed,
    });

    // Mutate lot to track remaining balance
    lot.amount -= consumeAmount;
    lot.costBasisUsd -= consumedCostBasis;
    remainingAmount -= consumeAmount;

    // Only count toward taxable gain if held <= 12 months
    if (!isExempt(lot.acquiredAt, event.date)) {
      taxableCostBasis += consumedCostBasis;
      // Proportional proceeds for this lot portion
      const portionProceeds =
        (consumeAmount / event.amount) * event.proceedsUsd;
      taxableProceeds += portionProceeds;
    }

    if (!earliestLotDate) {
      earliestLotDate = lot.acquiredAt;
    }
  }

  if (remainingAmount > 0.00000001) {
    console.warn(
      `[DTax GERMANY_FIFO] Insufficient lots for ${event.asset}: ` +
        `needed ${event.amount}, matched ${event.amount - remainingAmount}`,
    );
  }

  const feeUsd = event.feeUsd ?? 0;
  const gainLoss = taxableProceeds - taxableCostBasis - feeUsd;
  const holdingPeriod = earliestLotDate
    ? getHoldingPeriod(earliestLotDate, event.date)
    : "SHORT_TERM";

  return {
    event,
    matchedLots,
    gainLoss,
    holdingPeriod,
    method: "GERMANY_FIFO",
  };
}
