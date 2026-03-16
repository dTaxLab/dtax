/**
 * Shared helpers for cost basis calculation methods.
 * @license AGPL-3.0
 */

import type { HoldingPeriod } from "../types";

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
