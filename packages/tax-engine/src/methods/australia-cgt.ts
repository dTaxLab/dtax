/**
 * Australia CGT Discount Method (ATO Section 115).
 *
 * Uses FIFO lot ordering. Individuals and trusts who held an asset for
 * more than 12 months qualify for a 50% CGT discount on gains.
 * Losses are never discounted — they retain full face value.
 *
 * Key rules:
 * - Holding > 12 months AND gain > 0  → gain × 0.5
 * - Holding > 12 months AND gain ≤ 0  → loss unchanged (fully deductible)
 * - Holding ≤ 12 months               → full gain/loss (no discount)
 * - Fees are allocated proportionally across lots before discount
 *
 * Out of scope (MVP): superannuation funds (33% discount), indexation
 * method (pre-1999 assets), same-asset replacement rules.
 *
 * Reference: ATO https://www.ato.gov.au/individuals-and-families/
 *   investments-and-assets/capital-gains-tax/cgt-discount
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
 * Calculate capital gains/losses using the Australian CGT discount method.
 *
 * Each matched lot is evaluated independently:
 *   lotGain = lotProceeds - lotCostBasis - lotFee
 *   If held > 12 months (ATO day-after rule) && lotGain > 0: apply 50% discount
 *
 * @param lots        Available tax lots (mutated: amount/costBasis reduced)
 * @param event       The taxable disposal event
 * @param strictSilo  If true, only match lots from the same source
 */
export function calculateAustraliaCGT(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const applicableLots = strictSilo
    ? lots.filter((l) => l.sourceId === event.sourceId)
    : lots;

  const sortedLots = [...applicableLots]
    .filter(
      (lot) => lot.asset === event.asset && !isEffectivelyZero(lot.amount),
    )
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

  let remainingAmount = event.amount;
  let totalGainLoss = 0;
  const matchedLots: MatchedLot[] = [];
  let earliestLotDate: Date | null = null;
  const feeUsd = event.feeUsd ?? 0;

  for (const lot of sortedLots) {
    if (isEffectivelyZero(remainingAmount) || remainingAmount < 0) break;

    const consumeAmount = Math.min(lot.amount, remainingAmount);
    const fraction = ddiv(consumeAmount, event.amount);

    const consumedCostBasis = dmul(ddiv(lot.costBasisUsd, lot.amount), consumeAmount);
    const lotProceeds = dmul(fraction, event.proceedsUsd);
    const lotFee = dmul(fraction, feeUsd);
    const fullyConsumed = isEffectivelyZero(dsub(lot.amount, consumeAmount));

    matchedLots.push({
      lotId: lot.id,
      amountConsumed: consumeAmount,
      costBasisUsd: consumedCostBasis,
      fullyConsumed,
    });

    lot.amount = dsub(lot.amount, consumeAmount);
    lot.costBasisUsd = dsub(lot.costBasisUsd, consumedCostBasis);
    remainingAmount = dsub(remainingAmount, consumeAmount);

    let lotGainLoss = dsub(dsub(lotProceeds, consumedCostBasis), lotFee);

    // 50% discount: long-term gains only; losses are fully deductible (ATO s.115)
    if (getHoldingPeriod(lot.acquiredAt, event.date) === "LONG_TERM" && lotGainLoss > 0) {
      lotGainLoss = dmul(lotGainLoss, 0.5);
    }

    totalGainLoss = dadd(totalGainLoss, lotGainLoss);

    if (!earliestLotDate) {
      earliestLotDate = lot.acquiredAt;
    }
  }

  if (!isEffectivelyZero(remainingAmount) && remainingAmount > 0) {
    console.warn(
      `[DTax AU_CGT_DISCOUNT] Insufficient lots for ${event.asset}: ` +
        `needed ${event.amount}, matched ${dsub(event.amount, remainingAmount)}`,
    );
  }

  return {
    event,
    matchedLots,
    gainLoss: totalGainLoss,
    holdingPeriod: earliestLotDate
      ? getHoldingPeriod(earliestLotDate, event.date)
      : "SHORT_TERM",
    method: "AU_CGT_DISCOUNT",
  };
}
