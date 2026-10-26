/**
 * UK Share Pooling (HMRC) with the same-day and 30-day matching rules.
 *
 * HMRC identification order for each disposal (days are UK calendar days):
 *   1. Same-day rule  — acquisitions on the same day.
 *   2. 30-day rule    — acquisitions in the 30 days after the disposal day
 *                       ("bed and breakfasting"), earliest first. Quantity that
 *                       a later disposal on the acquisition day needs for its
 *                       own same-day match is left for that disposal.
 *   3. Section 104    — the pool of earlier holdings, costed at the weighted
 *                       average of the pool.
 * Same-day and 30-day matches use the matched lot's own acquisition cost and
 * remove that quantity from the lot, so it never enters the pool afterwards.
 *
 * Sources: TCGA 1992 s104 (pool), s105(1) (same day, acquisitions of one day
 * count as a single acquisition), s106A (30 days, earliest acquisition first;
 * all subject to s105(1)); HMRC Cryptoassets Manual CRYPTO22200-CRYPTO22255.
 * Not applied: the s106A exclusion for acquisitions made while not UK resident.
 *
 * Lots must be offered up to 30 days past the disposal day (the calculator
 * does this for this method). Events must be processed in chronological order.
 *
 * @license AGPL-3.0
 */

import type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  MatchedLot,
  UkMatchRule,
} from "../types";
import {
  getHoldingPeriod,
  rebalanceAverageCost,
  ukDayIndex,
  ukDayOfLot,
} from "./shared";
import { dadd, dsub, dmul, ddiv, isEffectivelyZero } from "../math";

/** Days after the disposal day in which acquisitions are matched (30-day rule). */
export const UK_THIRTY_DAY_WINDOW = 30;

/**
 * Calculate capital gains/losses using UK share pooling.
 *
 * @param lots - Tax lots, including acquisitions up to 30 days after the disposal day
 * @param event - The taxable event (disposal)
 * @param strictSilo - If true, only match lots with same sourceId
 * @param pendingDisposals - Disposals not yet calculated (used so that a later
 *   same-day disposal keeps priority over this disposal's 30-day match)
 * @returns CalculationResult; each matched lot carries the HMRC rule applied
 */
export function calculateUKSharePooling(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
  pendingDisposals: TaxableEvent[] = [],
): CalculationResult {
  const applicableLots = strictSilo
    ? lots.filter((l) => l.sourceId === event.sourceId)
    : lots;

  const assetLots = applicableLots
    .filter(
      (lot) => lot.asset === event.asset && !isEffectivelyZero(lot.amount),
    )
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

  const eventDay = ukDayIndex(event.date);
  const dayOf = ukDayOfLot;
  const sameDayLots = assetLots.filter((l) => dayOf(l) === eventDay);
  const thirtyDayLots = assetLots.filter(
    (l) => dayOf(l) > eventDay && dayOf(l) <= eventDay + UK_THIRTY_DAY_WINDOW,
  );
  const poolLots = assetLots.filter((l) => dayOf(l) < eventDay);

  let remainingAmount = event.amount;
  let totalCostBasis = 0;
  const matchedLots: MatchedLot[] = [];
  let earliestLotDate: Date | null = null;
  const open = () => !isEffectivelyZero(remainingAmount) && remainingAmount > 0;

  const consume = (
    lot: TaxLot,
    amount: number,
    rule: UkMatchRule,
    costPerUnit: number,
  ) => {
    const consumeAmount = Math.min(lot.amount, remainingAmount, amount);
    if (isEffectivelyZero(consumeAmount) || consumeAmount < 0) return 0;
    const consumedCost = dmul(costPerUnit, consumeAmount);
    const fullyConsumed = isEffectivelyZero(dsub(lot.amount, consumeAmount));
    matchedLots.push({
      lotId: lot.id,
      amountConsumed: consumeAmount,
      costBasisUsd: consumedCost,
      fullyConsumed,
      rule,
    });
    const ownCostPerUnit = ddiv(lot.costBasisUsd, lot.amount);
    lot.amount = dsub(lot.amount, consumeAmount);
    lot.costBasisUsd = dsub(
      lot.costBasisUsd,
      dmul(ownCostPerUnit, consumeAmount),
    );
    totalCostBasis = dadd(totalCostBasis, consumedCost);
    remainingAmount = dsub(remainingAmount, consumeAmount);
    if (!earliestLotDate || lot.acquiredAt < earliestLotDate) {
      earliestLotDate = lot.acquiredAt;
    }
    return consumeAmount;
  };

  // Acquisitions of one asset on one day count as a single acquisition at their
  // average cost (TCGA 1992 s105(1)), so the cost does not depend on which lot
  // of that day is consumed first.
  const averageCost = (group: TaxLot[]): number => {
    let amount = 0;
    let cost = 0;
    for (const l of group) {
      amount = dadd(amount, l.amount);
      cost = dadd(cost, l.costBasisUsd);
    }
    return !isEffectivelyZero(amount) ? ddiv(cost, amount) : 0;
  };

  // 1. Same-day
  if (sameDayLots.length > 0) {
    const avg = averageCost(sameDayLots);
    for (const lot of sameDayLots) {
      if (!open()) break;
      consume(lot, lot.amount, "SAME_DAY", avg);
    }
    rebalanceAverageCost(sameDayLots, avg);
  }

  // 2. 30-day: day by day, leaving what later same-day disposals will need
  if (open()) {
    const reservedByDay = new Map<number, number>();
    for (const p of pendingDisposals) {
      if (p.id === event.id || p.asset !== event.asset) continue;
      if (strictSilo && p.sourceId !== event.sourceId) continue;
      const day = ukDayIndex(p.date);
      if (day <= eventDay) continue;
      reservedByDay.set(day, dadd(reservedByDay.get(day) ?? 0, p.amount));
    }
    const lotsByDay = new Map<number, TaxLot[]>();
    for (const lot of thirtyDayLots) {
      const day = dayOf(lot);
      const group = lotsByDay.get(day);
      if (group) group.push(lot);
      else lotsByDay.set(day, [lot]);
    }
    for (const [day, group] of lotsByDay) {
      if (!open()) break;
      const avg = averageCost(group);
      let reserved = reservedByDay.get(day) ?? 0;
      for (const lot of group) {
        if (!open()) break;
        // The reserve is taken from the day's earliest lots first
        const held = Math.min(lot.amount, reserved);
        reserved = dsub(reserved, held);
        const available = dsub(lot.amount, held);
        if (isEffectivelyZero(available) || available < 0) continue;
        consume(lot, available, "THIRTY_DAY", avg);
      }
      rebalanceAverageCost(group, avg);
    }
  }

  // 3. Section 104 pool: weighted average over what is left of earlier holdings
  if (open()) {
    let poolAmount = 0;
    let poolCost = 0;
    for (const lot of poolLots) {
      poolAmount = dadd(poolAmount, lot.amount);
      poolCost = dadd(poolCost, lot.costBasisUsd);
    }
    const avgCostPerUnit = !isEffectivelyZero(poolAmount)
      ? ddiv(poolCost, poolAmount)
      : 0;
    for (const lot of poolLots) {
      if (!open()) break;
      consume(lot, lot.amount, "SECTION_104", avgCostPerUnit);
    }
    rebalanceAverageCost(poolLots, avgCostPerUnit);
  }

  const unmatchedAmount = open() ? remainingAmount : 0;
  if (unmatchedAmount > 0) {
    console.warn(
      `[DTax UK Share Pooling] Insufficient lots for ${event.asset}: ` +
        `needed ${event.amount}, matched ${dsub(event.amount, remainingAmount)}`,
    );
  }

  const feeUsd = event.feeUsd ?? 0;
  const gainLoss = dsub(dsub(event.proceedsUsd, totalCostBasis), feeUsd);
  const holdingPeriod = earliestLotDate
    ? getHoldingPeriod(earliestLotDate, event.date)
    : "SHORT_TERM";

  return {
    event,
    matchedLots,
    gainLoss,
    holdingPeriod,
    method: "UK_SHARE_POOLING",
    unmatchedAmount,
  };
}
