/**
 * Decimal-precision arithmetic helpers for tax calculations.
 *
 * Wraps decimal.js to provide exact arithmetic for financial computations.
 * All public functions accept and return JavaScript `number`, performing
 * conversions at the boundary so call sites stay readable.
 *
 * @license AGPL-3.0
 */

import Decimal from "decimal.js";

// Configure Decimal for financial calculations: 20 significant digits, ROUND_HALF_UP
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Round a dollar amount to whole cents exactly the way Form 8949 lines do.
 * Every figure that must agree with Form 8949 / Schedule D (report summary
 * totals, per-line results) rounds with this one function, so the summary and
 * the form cannot drift apart by a few cents on large accounts.
 */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface GainTotals {
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
}

/**
 * Split disposal results into gain and loss totals per holding period, each
 * disposal rounded to cents first (see roundCents). Losses are positive numbers.
 */
export function summarizeGains(
  results: ReadonlyArray<{
    gainLoss: number;
    holdingPeriod: "SHORT_TERM" | "LONG_TERM";
  }>,
): GainTotals {
  const t: GainTotals = {
    shortTermGains: 0,
    shortTermLosses: 0,
    longTermGains: 0,
    longTermLosses: 0,
  };
  for (const r of results) {
    const gl = roundCents(r.gainLoss);
    if (r.holdingPeriod === "SHORT_TERM") {
      if (gl >= 0) t.shortTermGains += gl;
      else t.shortTermLosses += Math.abs(gl);
    } else if (gl >= 0) t.longTermGains += gl;
    else t.longTermLosses += Math.abs(gl);
  }
  return t;
}

/** Add two financial values without floating-point drift. */
export function dadd(a: number, b: number): number {
  return new Decimal(a).plus(new Decimal(b)).toNumber();
}

/** Subtract two financial values without floating-point drift. */
export function dsub(a: number, b: number): number {
  return new Decimal(a).minus(new Decimal(b)).toNumber();
}

/** Multiply two financial values without floating-point drift. */
export function dmul(a: number, b: number): number {
  return new Decimal(a).times(new Decimal(b)).toNumber();
}

/** Divide two financial values without floating-point drift. Returns 0 if divisor is 0. */
export function ddiv(a: number, b: number): number {
  if (b === 0) return 0;
  return new Decimal(a).dividedBy(new Decimal(b)).toNumber();
}

/** Check if a value is effectively zero (within crypto dust threshold). */
export function isEffectivelyZero(a: number, epsilon = 1e-8): boolean {
  return Math.abs(a) < epsilon;
}
