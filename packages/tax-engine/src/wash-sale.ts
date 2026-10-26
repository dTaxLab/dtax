/**
 * Wash Sale Detection Engine
 *
 * IRS wash sale rule (IRC §1091): If you sell a security at a loss and
 * acquire a "substantially identical" security within 30 days before
 * or after the sale, the loss is disallowed. The disallowed loss is
 * added to the cost basis of the replacement lot.
 *
 * Note: IRC §1091 is written for "stock or securities". Whether it reaches
 * digital assets is not settled (the IRS position is still evolving and
 * legislation has been proposed), so the rule is optional in dTax and off by
 * default; conservative tax advice recommends tracking wash sales for crypto. DTax detects and flags them
 * as a protective measure. This module only detects: the Form 8949 W
 * adjustment is built from its result, and the API adds each disallowed loss
 * to the cost of its replacement lot in the following year's calculation
 * (priorYearWashSaleBasis).
 *
 * @license AGPL-3.0
 */

import type { CalculationResult } from "./types";
import { ddiv, dmul } from "./math";
import { baseLotId } from "./methods/shared";

/** Return the number of UTC calendar days between two dates (signed) */
function utcDaysDiff(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const aDay = Math.floor(a.getTime() / msPerDay);
  const bDay = Math.floor(b.getTime() / msPerDay);
  return bDay - aDay;
}

/** A detected wash sale with adjustment details */
export interface WashSaleAdjustment {
  /** ID of the loss event (the sale at a loss) */
  lossEventId: string;
  /** Asset that triggered the wash sale */
  asset: string;
  /** Original loss amount (negative number) */
  originalLoss: number;
  /** Amount of loss disallowed (positive number) */
  disallowedLoss: number;
  /** ID of the replacement acquisition lot */
  replacementLotId: string;
  /** Date of the replacement acquisition */
  replacementDate: Date;
  /** Whether the loss is fully or partially disallowed */
  fullDisallowance: boolean;
}

/** Result of wash sale detection */
export interface WashSaleResult {
  /** All detected wash sale adjustments */
  adjustments: WashSaleAdjustment[];
  /** Adjusted calculation results (with wash sale codes applied) */
  adjustedResults: CalculationResult[];
  /** Total disallowed losses */
  totalDisallowed: number;
}

/** Acquisition record for wash sale matching */
export interface AcquisitionRecord {
  /** Lot ID */
  lotId: string;
  /** Asset symbol */
  asset: string;
  /** Amount acquired */
  amount: number;
  /** Date acquired */
  acquiredAt: Date;
}

/**
 * Detect wash sales from calculation results and acquisition records.
 *
 * Algorithm:
 * 1. Identify all loss events from CalculationResult[]
 * 2. For each loss event, search for acquisitions of the same asset
 *    within 30 days before or after the sale date
 * 3. Match losses to replacement lots (earliest replacement first)
 * 4. Calculate disallowed loss amount (min of loss and replacement amount × per-unit loss)
 *
 * @param results - Calculation results from the tax engine
 * @param acquisitions - All acquisition records (from TaxLot[] or transaction history)
 * @param dispositionLotIds - Set of lot IDs that were consumed by dispositions in this tax year
 *                            (to avoid matching a lot that was itself the source of the loss)
 */
export function detectWashSales(
  results: CalculationResult[],
  acquisitions: AcquisitionRecord[],
  dispositionLotIds?: Set<string>,
): WashSaleResult {
  const adjustments: WashSaleAdjustment[] = [];
  const usedReplacementLots = new Set<string>();

  // Find all loss events, sorted by date
  const lossEvents = results
    .filter((r) => r.gainLoss < 0)
    .sort((a, b) => a.event.date.getTime() - b.event.date.getTime());

  // Sort acquisitions by date for deterministic matching
  const sortedAcquisitions = [...acquisitions].sort(
    (a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime(),
  );

  for (const lossResult of lossEvents) {
    const { event } = lossResult;

    // Find replacement acquisitions: same asset, within 30 calendar days (TAX-4: use UTC days, not ms)
    const replacements = sortedAcquisitions.filter((acq) => {
      // Must be same asset
      if (acq.asset !== event.asset) return false;

      // Must be within 30 calendar-day window (IRS counts calendar days, not hours)
      const daysDiff = Math.abs(utcDaysDiff(event.date, acq.acquiredAt));
      if (daysDiff > 30) return false;

      // Cannot be the same lot that was sold (lot consumed in this disposition)
      if (dispositionLotIds?.has(acq.lotId)) return false;

      // Cannot already be used as a replacement for another wash sale
      if (usedReplacementLots.has(acq.lotId)) return false;

      return true;
    });

    if (replacements.length === 0) continue;

    // Match earliest replacement lot (FIFO per IRC §1091)
    const replacement = replacements.reduce((earliest, r) =>
      r.acquiredAt < earliest.acquiredAt ? r : earliest,
    );

    // Calculate disallowed loss using Decimal math (TAX-3: avoid native JS division)
    const totalLoss = Math.abs(lossResult.gainLoss);
    const lossPerUnit = ddiv(totalLoss, event.amount);
    const disallowedAmount = Math.min(replacement.amount, event.amount);
    const disallowedLoss =
      Math.round(dmul(lossPerUnit, disallowedAmount) * 100) / 100;

    usedReplacementLots.add(replacement.lotId);

    adjustments.push({
      lossEventId: event.id,
      asset: event.asset,
      originalLoss: lossResult.gainLoss,
      disallowedLoss,
      replacementLotId: replacement.lotId,
      replacementDate: replacement.acquiredAt,
      fullDisallowance: disallowedAmount >= event.amount,
    });
  }

  // Create adjusted results: modify gainLoss for wash sale events
  const adjustmentByEventId = new Map(
    adjustments.map((a) => [a.lossEventId, a]),
  );

  const adjustedResults = results.map((r) => {
    const adj = adjustmentByEventId.get(r.event.id);
    if (!adj) return r;

    return {
      ...r,
      gainLoss: Math.round((r.gainLoss + adj.disallowedLoss) * 100) / 100,
      washSaleAdjustment: adj,
    };
  });

  const totalDisallowed = adjustments.reduce(
    (sum, a) => sum + a.disallowedLoss,
    0,
  );

  return {
    adjustments,
    adjustedResults,
    totalDisallowed: Math.round(totalDisallowed * 100) / 100,
  };
}

/** One loss spread over (part of) one replacement lot. */
export interface WashSaleAllocation {
  lossEventId: string;
  asset: string;
  /** Loss of the whole sale (positive number). */
  originalLoss: number;
  replacementLotId: string;
  replacementDate: Date;
  /** Units of the replacement lot used for this loss. */
  quantity: number;
  /** Loss disallowed on those units (positive number). */
  disallowed: number;
}

/** Result of carrying disallowed wash-sale losses into replacement lots. */
export interface WashSaleCarryover {
  /** Extra cost to add to each replacement lot, by lot id. */
  extraCost: Map<string, number>;
  /** Replacement quantity already used per lot (so it is not used again). */
  usedQuantity: Map<string, number>;
  /** The same allocation, loss by loss. */
  allocations: WashSaleAllocation[];
}

/**
 * Allocate disallowed wash-sale losses to replacement lots. This is the single
 * allocation used both for the Form 8949 W adjustment of the year of the sale
 * and for the cost added to the replacement lot in later years, so the two can
 * never disagree.
 *
 * Walks the losses in date order and spreads each over the replacement
 * quantity that is still free:
 * - a replacement lot can serve several losses until its quantity is used up;
 * - a lot is only a replacement if no sale had touched it by the end of the
 *   loss's calendar year (`touchedLotIds`: consumed by any sale so far;
 *   `consumedAt`: the date of the first sale that consumed each lot). The cost
 *   added later is spread over every unit of the lot, so this keeps it from
 *   landing on units that were already sold;
 * - the sold lots of the loss itself are never its replacement;
 * - sub-cent losses are ignored.
 *
 * @param results - Results of the sales that have a price
 * @param acquisitions - Acquisitions as bought (original quantities)
 * @param options.touchedLotIds - Lots consumed by any sale up to the end of the period
 * @param options.consumedAt - Date of the first sale that consumed each lot
 * @param options.windowDays - Calendar days before and after the sale (30)
 */
export function computeWashSaleCarryover(
  results: CalculationResult[],
  acquisitions: AcquisitionRecord[],
  options: {
    touchedLotIds?: Set<string>;
    consumedAt?: Map<string, Date>;
    windowDays?: number;
  } = {},
): WashSaleCarryover {
  const windowDays = options.windowDays ?? 30;
  const touched = options.touchedLotIds ?? new Set<string>();
  const consumedAt = options.consumedAt ?? new Map<string, Date>();
  const extraCost = new Map<string, number>();
  const usedQuantity = new Map<string, number>();
  const allocations: WashSaleAllocation[] = [];

  const byAsset = new Map<string, AcquisitionRecord[]>();
  for (const a of acquisitions) {
    const list = byAsset.get(a.asset);
    if (list) list.push(a);
    else byAsset.set(a.asset, [a]);
  }
  for (const list of byAsset.values()) {
    list.sort((x, y) => x.acquiredAt.getTime() - y.acquiredAt.getTime());
  }
  const dayOf = (d: Date) => Math.floor(d.getTime() / (24 * 60 * 60 * 1000));

  const losses = results
    .filter((r) => r.gainLoss <= -0.005 && r.event.amount > 0)
    .sort((a, b) => a.event.date.getTime() - b.event.date.getTime());

  for (const loss of losses) {
    const list = byAsset.get(loss.event.asset);
    if (!list) continue;
    const sold = new Set(loss.matchedLots.map((m) => baseLotId(m.lotId)));
    const saleDay = dayOf(loss.event.date);
    const yearEnd = Date.UTC(loss.event.date.getUTCFullYear() + 1, 0, 1);
    const perUnitLoss = ddiv(-loss.gainLoss, loss.event.amount);
    let toCover = loss.event.amount;

    // first acquisition inside the window (binary search on the sorted list)
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dayOf(list[mid].acquiredAt) < saleDay - windowDays) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < list.length && toCover > 1e-12; i++) {
      const repl = list[i];
      if (dayOf(repl.acquiredAt) > saleDay + windowDays) break;
      if (sold.has(repl.lotId) || touched.has(repl.lotId)) continue;
      // touched by a sale up to the end of the loss's calendar year
      const first = consumedAt.get(repl.lotId);
      if (first && first.getTime() < yearEnd) continue;
      const free = repl.amount - (usedQuantity.get(repl.lotId) ?? 0);
      if (free <= 1e-12) continue;
      const qty = Math.min(free, toCover);
      const disallowed = dmul(perUnitLoss, qty);
      usedQuantity.set(repl.lotId, (usedQuantity.get(repl.lotId) ?? 0) + qty);
      extraCost.set(repl.lotId, (extraCost.get(repl.lotId) ?? 0) + disallowed);
      allocations.push({
        lossEventId: loss.event.id,
        asset: loss.event.asset,
        originalLoss: -loss.gainLoss,
        replacementLotId: repl.lotId,
        replacementDate: repl.acquiredAt,
        quantity: qty,
        disallowed,
      });
      toCover -= qty;
    }
  }
  return { extraCost, usedQuantity, allocations };
}

/** One Form 8949 W adjustment per loss, from the shared allocation. */
export function washSaleAdjustmentsFromAllocations(
  allocations: WashSaleAllocation[],
  results: CalculationResult[],
): WashSaleAdjustment[] {
  const byLoss = new Map<string, WashSaleAllocation[]>();
  for (const a of allocations) {
    const list = byLoss.get(a.lossEventId);
    if (list) list.push(a);
    else byLoss.set(a.lossEventId, [a]);
  }
  const amountOf = new Map(results.map((r) => [r.event.id, r.event.amount]));
  const out: WashSaleAdjustment[] = [];
  for (const [id, list] of byLoss) {
    const disallowed =
      Math.round(list.reduce((n, a) => n + a.disallowed, 0) * 100) / 100;
    const qty = list.reduce((n, a) => n + a.quantity, 0);
    out.push({
      lossEventId: id,
      asset: list[0].asset,
      originalLoss: -list[0].originalLoss,
      disallowedLoss: disallowed,
      replacementLotId: list[0].replacementLotId,
      replacementDate: list[0].replacementDate,
      fullDisallowance: qty >= (amountOf.get(id) ?? 0) - 1e-12,
    });
  }
  return out;
}
