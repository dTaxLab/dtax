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
} from "../types";
import { getHoldingPeriod } from "./shared";
import { dadd, dsub, dmul, ddiv, isEffectivelyZero } from "../math";

/**
 * Calculate capital gains/losses using the LIFO method.
 *
 * @param lots - Available tax lots (will be sorted by acquisition date DESCENDING)
 * @param event - The taxable event (sale/trade)
 * @returns CalculationResult with gains/losses and matched lots
 */
export function calculateLIFO(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const applicableLots = strictSilo
    ? lots.filter((l) => l.sourceId === event.sourceId)
    : lots;

  // Sort lots by acquisition date DESCENDING for LIFO (newest first)
  const sortedLots = [...applicableLots]
    .filter(
      (lot) => lot.asset === event.asset && !isEffectivelyZero(lot.amount),
    )
    .sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime());

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
      `[DTax LIFO] Insufficient lots for ${event.asset}: ` +
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
    method: "LIFO",
  };
}
