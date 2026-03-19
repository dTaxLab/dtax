/**
 * Method Comparison Engine
 *
 * Compares all applicable cost basis methods for a hypothetical sale,
 * recommending the optimal method based on tax impact, wash sale risk, and
 * potential savings.
 *
 * @license AGPL-3.0
 */

import type { TaxLot } from "./types";
import type { SimulationInput, SimulationResult } from "./simulator";
import { simulateSale } from "./simulator";
import type { AcquisitionRecord } from "./wash-sale";

/** Reason codes for the recommended method (for i18n on the frontend). */
export type RecommendedReasonCode =
  | "identical"
  | "lowest_gain"
  | "largest_loss_clean"
  | "largest_loss";

/** All non-SPECIFIC_ID methods supported by the simulator. */
const COMPARABLE_METHODS = [
  "FIFO",
  "LIFO",
  "HIFO",
  "GERMANY_FIFO",
  "PMPA",
  "TOTAL_AVERAGE",
  "UK_SHARE_POOLING",
] as const;

type ComparableMethod = (typeof COMPARABLE_METHODS)[number];

/** Result of comparing all cost basis methods. */
export interface ComparisonResult {
  /** Simulation results keyed by method name */
  methods: Record<ComparableMethod, SimulationResult>;
  /** Recommended method name */
  recommended: ComparableMethod;
  /** i18n reason code — translate on the frontend */
  recommendedReasonCode: RecommendedReasonCode;
  /** Absolute difference between best and worst projected gain/loss */
  savings: number;
}

interface MethodEntry {
  name: ComparableMethod;
  result: SimulationResult;
}

/**
 * Compare all applicable cost basis methods for a hypothetical sale and
 * recommend the optimal method.
 *
 * Deep-clones lots for each simulation so the caller's data is never mutated.
 * SPECIFIC_ID is excluded because it requires explicit lot selection.
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
  const entries: MethodEntry[] = COMPARABLE_METHODS.map((m) => ({
    name: m,
    result: simulateSale(lots, { ...input, method: m }, acquisitions),
  }));

  const { recommended, recommendedReasonCode } = pickRecommendation(entries);

  const allGainLoss = entries.map((e) => e.result.projectedGainLoss);
  const worst = Math.max(...allGainLoss);
  const best = Math.min(...allGainLoss);
  const savings = Math.abs(worst - best);

  const methods = Object.fromEntries(
    entries.map((e) => [e.name, e.result]),
  ) as Record<ComparableMethod, SimulationResult>;

  return {
    methods,
    recommended,
    recommendedReasonCode,
    savings,
  };
}

function pickRecommendation(entries: MethodEntry[]): {
  recommended: ComparableMethod;
  recommendedReasonCode: RecommendedReasonCode;
} {
  const gains = entries.map((e) => e.result.projectedGainLoss);
  const allIdentical = gains.every((g) => g === gains[0]);
  if (allIdentical) {
    return { recommended: "FIFO", recommendedReasonCode: "identical" };
  }

  const allGains = entries.every((e) => e.result.projectedGainLoss >= 0);

  if (allGains) {
    return pickLowestGain(entries);
  }

  return pickLargestLoss(entries);
}

function pickLowestGain(entries: MethodEntry[]): {
  recommended: ComparableMethod;
  recommendedReasonCode: RecommendedReasonCode;
} {
  const sorted = [...entries].sort(
    (a, b) => a.result.projectedGainLoss - b.result.projectedGainLoss,
  );
  return {
    recommended: sorted[0].name,
    recommendedReasonCode: "lowest_gain",
  };
}

function pickLargestLoss(entries: MethodEntry[]): {
  recommended: ComparableMethod;
  recommendedReasonCode: RecommendedReasonCode;
} {
  const someHaveWash = entries.some((e) => e.result.washSaleRisk);
  const someClean = entries.some((e) => !e.result.washSaleRisk);
  const shouldDowngradeWash = someHaveWash && someClean;

  let candidates = shouldDowngradeWash
    ? entries.filter((e) => !e.result.washSaleRisk)
    : entries;

  if (candidates.length === 0) {
    candidates = entries;
  }

  const sorted = [...candidates].sort(
    (a, b) => a.result.projectedGainLoss - b.result.projectedGainLoss,
  );

  return {
    recommended: sorted[0].name,
    recommendedReasonCode: shouldDowngradeWash
      ? "largest_loss_clean"
      : "largest_loss",
  };
}
