/**
 * Shared helpers for cost basis calculation methods.
 * @license AGPL-3.0
 */

import type { HoldingPeriod, TaxLot } from "../types";
import { dmul } from "../math";

/**
 * Determine holding period using IRS calendar-based rule.
 * Long-term = held more than one year from the day after acquisition.
 */
export function getHoldingPeriod(
  acquiredAt: Date,
  soldAt: Date,
): HoldingPeriod {
  const dayAfter = new Date(acquiredAt);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const oneYearLater = new Date(dayAfter);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return soldAt >= oneYearLater ? "LONG_TERM" : "SHORT_TERM";
}

/**
 * After consuming an average-cost pool, make every remaining lot carry the
 * pool's average cost per unit. Consuming FIFO at the average while reducing
 * each lot at its own cost would otherwise leave the pool's remaining cost
 * different from (remaining units x average), drifting later disposals.
 */
export function rebalanceAverageCost(
  poolLots: TaxLot[],
  avgCostPerUnit: number,
): void {
  for (const lot of poolLots) {
    lot.costBasisUsd = dmul(avgCostPerUnit, lot.amount);
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000;
const ukDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Calendar-day number (days since 1970-01-01) of an instant on the UK date.
 * HMRC's same-day and 30-day rules count UK calendar days, not UTC days.
 */
export function ukDayIndex(d: Date): number {
  const [y, m, day] = ukDateFormat.format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, day) / DAY_MS;
}

const lotDayCache = new WeakMap<TaxLot, { ms: number; day: number }>();

/**
 * UK calendar day of a lot's acquisition, cached per lot. Formatting a date in
 * the Europe/London zone is ~500x slower than a plain comparison and the UK
 * method asks for it once per lot per disposal.
 */
export function ukDayOfLot(lot: TaxLot): number {
  const ms = lot.acquiredAt.getTime();
  const hit = lotDayCache.get(lot);
  if (hit && hit.ms === ms) return hit.day;
  const day = ukDayIndex(lot.acquiredAt);
  lotDayCache.set(lot, { ms, day });
  return day;
}

/** The UK calendar date (YYYY-MM-DD) of an instant. */
export function ukDateString(d: Date): string {
  return ukDateFormat.format(d);
}
