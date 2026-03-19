/**
 * Total Average (総平均法) — Japanese Cost Basis Method.
 *
 * All lots for an asset are averaged together to determine cost per unit.
 * Lots are consumed in FIFO order for tracking purposes.
 * In practice, Japan recalculates at year-end, but for per-event
 * calculation the logic is identical to weighted average.
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
 * Calculate capital gains/losses using the Total Average method.
 *
 * Formula: avgCostPerUnit = sum(costBasisUsd) / sum(amount) across all lots
 * Gain = proceedsUsd - (avgCostPerUnit × amountSold) - feeUsd
 *
 * @param lots - Available tax lots
 * @param event - The taxable event (sale/trade)
 * @param strictSilo - If true, only match lots with same sourceId
 * @returns CalculationResult with gains/losses using total average cost
 */
export function calculateTotalAverage(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const applicableLots = strictSilo
    ? lots.filter((l) => l.sourceId === event.sourceId)
    : lots;

  // Filter to matching asset with remaining balance
  const assetLots = applicableLots.filter(
    (lot) => lot.asset === event.asset && !isEffectivelyZero(lot.amount),
  );

  // Calculate total average cost per unit across ALL remaining lots
  let totalAmount = 0;
  let totalCostBasis = 0;
  for (const lot of assetLots) {
    totalAmount = dadd(totalAmount, lot.amount);
    totalCostBasis = dadd(totalCostBasis, lot.costBasisUsd);
  }

  const avgCostPerUnit = !isEffectivelyZero(totalAmount)
    ? ddiv(totalCostBasis, totalAmount)
    : 0;

  // Sort lots by acquisition date (ascending) for FIFO consumption
  const sortedLots = [...assetLots].sort(
    (a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime(),
  );

  let remainingAmount = event.amount;
  const matchedLots: MatchedLot[] = [];
  let earliestLotDate: Date | null = null;

  for (const lot of sortedLots) {
    if (isEffectivelyZero(remainingAmount) || remainingAmount < 0) break;

    const consumeAmount = Math.min(lot.amount, remainingAmount);
    // Use total average cost, not individual lot cost
    const consumedCostBasis = dmul(avgCostPerUnit, consumeAmount);
    const fullyConsumed = isEffectivelyZero(dsub(lot.amount, consumeAmount));

    matchedLots.push({
      lotId: lot.id,
      amountConsumed: consumeAmount,
      costBasisUsd: consumedCostBasis,
      fullyConsumed,
    });

    // Mutate lot to track remaining balance
    const actualCostPerUnit = !isEffectivelyZero(lot.amount)
      ? ddiv(lot.costBasisUsd, lot.amount)
      : 0;
    lot.amount = dsub(lot.amount, consumeAmount);
    lot.costBasisUsd = dsub(
      lot.costBasisUsd,
      dmul(actualCostPerUnit, consumeAmount),
    );
    remainingAmount = dsub(remainingAmount, consumeAmount);

    if (!earliestLotDate) {
      earliestLotDate = lot.acquiredAt;
    }
  }

  if (!isEffectivelyZero(remainingAmount) && remainingAmount > 0) {
    console.warn(
      `[DTax TOTAL_AVERAGE] Insufficient lots for ${event.asset}: ` +
        `needed ${event.amount}, matched ${dsub(event.amount, remainingAmount)}`,
    );
  }

  const totalConsumedCostBasis = dmul(
    avgCostPerUnit,
    dsub(event.amount, remainingAmount),
  );
  const feeUsd = event.feeUsd ?? 0;
  const gainLoss = dsub(
    dsub(event.proceedsUsd, totalConsumedCostBasis),
    feeUsd,
  );
  const holdingPeriod = earliestLotDate
    ? getHoldingPeriod(earliestLotDate, event.date)
    : "SHORT_TERM";

  return {
    event,
    matchedLots,
    gainLoss,
    holdingPeriod,
    method: "TOTAL_AVERAGE",
  };
}
