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
