/**
 * Method Comparison Engine
 *
 * Compares FIFO, LIFO, and HIFO cost basis methods for a hypothetical sale,
 * recommending the optimal method based on tax impact, wash sale risk, and
 * potential savings.
 *
 * @license AGPL-3.0
 */

import type { TaxLot } from "./types";
import type { SimulationInput, SimulationResult } from "./simulator";
import { simulateSale } from "./simulator";
import type { AcquisitionRecord } from "./wash-sale";

/** Result of comparing all three cost basis methods. */
export interface ComparisonResult {
  /** FIFO simulation result */
  fifo: SimulationResult;
  /** LIFO simulation result */
  lifo: SimulationResult;
  /** HIFO simulation result */
  hifo: SimulationResult;
  /** Recommended method */
  recommended: "FIFO" | "LIFO" | "HIFO";
  /** Human-readable reason for the recommendation */
  recommendedReason: string;
  /** Absolute difference between best and worst projected gain/loss */
  savings: number;
}

type MethodName = "FIFO" | "LIFO" | "HIFO";

interface MethodEntry {
  name: MethodName;
  result: SimulationResult;
}

/**
 * Compare all three cost basis methods (FIFO, LIFO, HIFO) for a hypothetical
 * sale and recommend the optimal method.
 *
 * Deep-clones lots for each simulation so the caller's data is never mutated.
 * Each method is simulated independently via `simulateSale`.
 *
 * Recommendation logic:
 * - If all results are gains: recommend the method with the smallest gain (lowest tax).
 * - If there are losses: recommend the method with the largest loss (most deduction),
 *   but downgrade methods that trigger wash sales when others do not.
 * - If all three methods produce identical results: recommend FIFO as the default.
 * - savings = Math.abs(worst.projectedGainLoss - best.projectedGainLoss)
 *
 * @param lots - Current tax lots (will NOT be mutated)
 * @param input - Simulation parameters (without method)
 * @param acquisitions - Optional acquisition records for wash sale detection
 * @returns Comparison result with recommendation
 */
export function compareAllMethods(
  lots: TaxLot[],
  input: Omit<SimulationInput, "method">,
  acquisitions?: AcquisitionRecord[],
): ComparisonResult {
  const fifo = simulateSale(lots, { ...input, method: "FIFO" }, acquisitions);
  const lifo = simulateSale(lots, { ...input, method: "LIFO" }, acquisitions);
  const hifo = simulateSale(lots, { ...input, method: "HIFO" }, acquisitions);

  const entries: MethodEntry[] = [
    { name: "FIFO", result: fifo },
    { name: "LIFO", result: lifo },
    { name: "HIFO", result: hifo },
  ];

  const { recommended, recommendedReason } = pickRecommendation(entries);

  const allGainLoss = entries.map((e) => e.result.projectedGainLoss);
  const worst = Math.max(...allGainLoss);
  const best = Math.min(...allGainLoss);
  const savings = Math.abs(worst - best);

  return {
    fifo,
    lifo,
    hifo,
    recommended,
    recommendedReason,
    savings,
  };
}

/**
 * Pick the recommended method from the three simulation results.
 *
 * @param entries - The three method entries to compare
 * @returns The recommended method name and reason
 */
function pickRecommendation(entries: MethodEntry[]): {
  recommended: MethodName;
  recommendedReason: string;
} {
  // Check if all three produce identical gain/loss
  const gains = entries.map((e) => e.result.projectedGainLoss);
  if (gains[0] === gains[1] && gains[1] === gains[2]) {
    return {
      recommended: "FIFO",
      recommendedReason:
        "All methods produce identical results; FIFO recommended as the standard default.",
    };
  }

  const allGains = entries.every((e) => e.result.projectedGainLoss >= 0);

  if (allGains) {
    return pickLowestGain(entries);
  }

  return pickLargestLoss(entries);
}

/**
 * When all methods produce gains, recommend the one with the smallest gain
 * (i.e., lowest tax liability).
 */
function pickLowestGain(entries: MethodEntry[]): {
  recommended: MethodName;
  recommendedReason: string;
} {
  // Sort ascending by projectedGainLoss — smallest first
  const sorted = [...entries].sort(
    (a, b) => a.result.projectedGainLoss - b.result.projectedGainLoss,
  );

  return {
    recommended: sorted[0].name,
    recommendedReason: `${sorted[0].name} produces the smallest taxable gain, minimizing tax liability.`,
  };
}

/**
 * When at least one method produces a loss, recommend the one with the
 * largest loss (most deduction). Methods that trigger wash sales while
 * others do not are downgraded.
 */
function pickLargestLoss(entries: MethodEntry[]): {
  recommended: MethodName;
  recommendedReason: string;
} {
  // Check wash sale status across methods
  const someHaveWash = entries.some((e) => e.result.washSaleRisk);
  const someClean = entries.some((e) => !e.result.washSaleRisk);
  const shouldDowngradeWash = someHaveWash && someClean;

  // Filter candidates: exclude wash-sale methods if others are clean
  let candidates = shouldDowngradeWash
    ? entries.filter((e) => !e.result.washSaleRisk)
    : entries;

  // If all were filtered out (shouldn't happen), fall back to all entries
  if (candidates.length === 0) {
    candidates = entries;
  }

  // Sort ascending by projectedGainLoss — most negative (largest loss) first
  const sorted = [...candidates].sort(
    (a, b) => a.result.projectedGainLoss - b.result.projectedGainLoss,
  );

  const best = sorted[0];
  const reason = shouldDowngradeWash
    ? `${best.name} provides the largest deductible loss without triggering a wash sale.`
    : `${best.name} provides the largest deductible loss, maximizing tax deductions.`;

  return {
    recommended: best.name,
    recommendedReason: reason,
  };
}
