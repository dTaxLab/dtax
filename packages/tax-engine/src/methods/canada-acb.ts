/**
 * Canada ACB (Adjusted Cost Base) Method — CRA IT-387R2.
 *
 * Cost basis is the running weighted average of all units held (ACB per unit).
 * On each disposal: gain = proceeds - (ACB/unit × units sold) - fees.
 * Lots are consumed in FIFO order for tracking; the weighted average is used
 * for the cost basis calculation.
 *
 * Key rules:
 * - ACB/unit = totalCostBasis / totalUnitsHeld (weighted average across all lots)
 * - Capital gains inclusion rate is 50% — engine returns full gain; UI layer notes
 *   that only 50% is taxable income
 * - Superficial Loss Rule (s.54 ITA): loss is denied if the same asset is
 *   reacquired within 30 days before OR after the sale (by taxpayer or
 *   affiliated person). The denied loss is added back to the new lot's ACB.
 *   MVP: superficial loss detection requires post-disposal lookahead and is
 *   not auto-adjusted here. A console warning is emitted for any net loss.
 *
 * Out of scope (MVP): affiliated-person rebuy detection, ACB adjustment on
 * superficial loss, partnership/trust ACB tracking.
 *
 * Reference: CRA https://www.canada.ca/en/revenue-agency/services/tax/
 *   individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/
 *   personal-income/line-12700-capital-gains/calculating-your-capital-gain-loss/
 *   adjusted-cost-base.html
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
 * Calculate capital gains/losses using the Canadian ACB weighted average method.
 *
 * ACB/unit = totalCostBasis / totalAmount (across all remaining lots for the asset)
 * Gain = proceedsUsd - (ACB/unit × amountSold) - feeUsd
 *
 * @param lots        Available tax lots (mutated: amount/costBasis reduced)
 * @param event       The taxable disposal event
 * @param strictSilo  If true, only match lots from the same source
 */
export function calculateCanadaACB(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const applicableLots = strictSilo
    ? lots.filter((l) => l.sourceId === event.sourceId)
    : lots;

  const assetLots = applicableLots.filter(
    (lot) => lot.asset === event.asset && !isEffectivelyZero(lot.amount),
  );

  // Compute weighted average ACB/unit across all remaining lots
  let totalAmount = 0;
  let totalCostBasis = 0;
  for (const lot of assetLots) {
    totalAmount = dadd(totalAmount, lot.amount);
    totalCostBasis = dadd(totalCostBasis, lot.costBasisUsd);
  }

  const acbPerUnit = !isEffectivelyZero(totalAmount)
    ? ddiv(totalCostBasis, totalAmount)
    : 0;

  // Consume lots in FIFO order for tracking
  const sortedLots = [...assetLots].sort(
    (a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime(),
  );

  let remainingAmount = event.amount;
  const matchedLots: MatchedLot[] = [];
  let earliestLotDate: Date | null = null;
  const feeUsd = event.feeUsd ?? 0;

  for (const lot of sortedLots) {
    if (isEffectivelyZero(remainingAmount) || remainingAmount < 0) break;

    const consumeAmount = Math.min(lot.amount, remainingAmount);
    const consumedCostBasis = dmul(acbPerUnit, consumeAmount);
    const fullyConsumed = isEffectivelyZero(dsub(lot.amount, consumeAmount));

    matchedLots.push({
      lotId: lot.id,
      amountConsumed: consumeAmount,
      costBasisUsd: consumedCostBasis,
      fullyConsumed,
    });

    // Mutate lot using its actual per-unit cost (not global ACB) to preserve pool accuracy
    const lotCostPerUnit = !isEffectivelyZero(lot.amount)
      ? ddiv(lot.costBasisUsd, lot.amount)
      : 0;
    lot.amount = dsub(lot.amount, consumeAmount);
    lot.costBasisUsd = dsub(lot.costBasisUsd, dmul(lotCostPerUnit, consumeAmount));
    remainingAmount = dsub(remainingAmount, consumeAmount);

    if (!earliestLotDate) {
      earliestLotDate = lot.acquiredAt;
    }
  }

  if (!isEffectivelyZero(remainingAmount) && remainingAmount > 0) {
    console.warn(
      `[DTax CA_ACB] Insufficient lots for ${event.asset}: ` +
        `needed ${event.amount}, matched ${dsub(event.amount, remainingAmount)}`,
    );
  }

  const amountSold = dsub(event.amount, remainingAmount);
  const totalConsumedCostBasis = dmul(acbPerUnit, amountSold);
  const gainLoss = dsub(dsub(event.proceedsUsd, totalConsumedCostBasis), feeUsd);

  // Superficial loss warning (MVP: detection only, no ACB auto-adjustment)
  // A loss within 30 days of a same-asset rebuy may be denied under ITA s.54.
  if (gainLoss < 0) {
    console.warn(
      `[DTax CA_ACB] Superficial loss candidate for ${event.asset} on ` +
        `${event.date.toISOString().slice(0, 10)}: loss = ${gainLoss}. ` +
        `Verify no same-asset rebuy within 30 days (ITA s.54).`,
    );
  }

  return {
    event,
    matchedLots,
    gainLoss,
    holdingPeriod: earliestLotDate
      ? getHoldingPeriod(earliestLotDate, event.date)
      : "SHORT_TERM",
    method: "CA_ACB",
  };
}
