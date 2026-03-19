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
} from "../types";
import { getHoldingPeriod } from "./shared";
import { dadd, dsub, dmul, ddiv, isEffectivelyZero } from "../math";

/**
 * Calculate capital gains/losses using the HIFO method.
 *
 * @param lots - Available tax lots (will be sorted by cost-per-unit DESCENDING)
 * @param event - The taxable event (sale/trade)
 * @returns CalculationResult with gains/losses and matched lots
 */
export function calculateHIFO(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const applicableLots = strictSilo
    ? lots.filter((l) => l.sourceId === event.sourceId)
    : lots;

  // Sort by cost-per-unit DESCENDING. Native division is sufficient for ordering;
  // exact Decimal arithmetic is reserved for the financial mutations below.
  const sortedLots = [...applicableLots]
    .filter(
      (lot) => lot.asset === event.asset && !isEffectivelyZero(lot.amount),
    )
    .sort((a, b) => b.costBasisUsd / b.amount - a.costBasisUsd / a.amount);

  let remainingAmount = event.amount;
  let totalCostBasis = 0;
  const matchedLots: MatchedLot[] = [];
  let earliestMatchedDate: Date | null = null;

  for (const lot of sortedLots) {
    if (isEffectivelyZero(remainingAmount) || remainingAmount < 0) break;

    const consumeAmount = Math.min(lot.amount, remainingAmount);
    const costPerUnit = !isEffectivelyZero(lot.amount)
      ? ddiv(lot.costBasisUsd, lot.amount)
      : 0;
    const consumedCostBasis = dmul(costPerUnit, consumeAmount);
    const fullyConsumed = isEffectivelyZero(dsub(lot.amount, consumeAmount));

    matchedLots.push({
      lotId: lot.id,
      amountConsumed: consumeAmount,
      costBasisUsd: consumedCostBasis,
      fullyConsumed,
    });

    // Mutate lot to track remaining balance across multiple calculations
    lot.amount = dsub(lot.amount, consumeAmount);
    lot.costBasisUsd = dsub(lot.costBasisUsd, consumedCostBasis);
    totalCostBasis = dadd(totalCostBasis, consumedCostBasis);
    remainingAmount = dsub(remainingAmount, consumeAmount);

    // Track the earliest matched lot for holding period
    if (!earliestMatchedDate || lot.acquiredAt < earliestMatchedDate) {
      earliestMatchedDate = lot.acquiredAt;
    }
  }

  if (!isEffectivelyZero(remainingAmount) && remainingAmount > 0) {
    console.warn(
      `[DTax HIFO] Insufficient lots for ${event.asset}: ` +
        `needed ${event.amount}, matched ${dsub(event.amount, remainingAmount)}`,
    );
  }

  const feeUsd = event.feeUsd ?? 0;
  const gainLoss = dsub(dsub(event.proceedsUsd, totalCostBasis), feeUsd);
  const holdingPeriod = earliestMatchedDate
    ? getHoldingPeriod(earliestMatchedDate, event.date)
    : "SHORT_TERM";

  return {
    event,
    matchedLots,
    gainLoss,
    holdingPeriod,
    method: "HIFO",
  };
}
