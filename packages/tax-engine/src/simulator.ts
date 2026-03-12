/**
 * Tax Impact Simulator
 *
 * Simulates hypothetical asset sales to project capital gains/losses,
 * holding period classification, and wash sale risk — without mutating
 * the caller's lot data.
 *
 * @license AGPL-3.0
 */

import { CostBasisCalculator } from "./calculator";
import type { TaxLot, TaxableEvent, CalculationResult } from "./types";
import { detectWashSales } from "./wash-sale";
import type { AcquisitionRecord } from "./wash-sale";

/** One year in milliseconds (accounts for leap years) */
const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Input parameters for a simulated sale. */
export interface SimulationInput {
  /** Asset symbol to simulate selling */
  asset: string;
  /** Amount to sell */
  amount: number;
  /** Price per unit in USD */
  pricePerUnit: number;
  /** Simulation date (default: now) */
  date?: Date;
  /** Cost basis method (default: FIFO) */
  method?: "FIFO" | "LIFO" | "HIFO";
  /** Wallet-silo mode */
  strictSilo?: boolean;
  /** Source wallet/exchange ID for strictSilo */
  sourceId?: string;
}

/** A single lot consumed during the simulation. */
export interface SimulatedLot {
  lotId: string;
  amount: number;
  costBasis: number;
  acquiredAt: Date;
  holdingPeriod: "SHORT_TERM" | "LONG_TERM";
  gainLoss: number;
}

/** Full result of a simulated sale. */
export interface SimulationResult {
  /** Total projected gain/loss */
  projectedGainLoss: number;
  /** Overall holding period */
  holdingPeriod: "SHORT_TERM" | "LONG_TERM" | "MIXED";
  /** Short-term portion of gain/loss */
  shortTermGainLoss: number;
  /** Long-term portion of gain/loss */
  longTermGainLoss: number;
  /** Total proceeds (amount * pricePerUnit) */
  proceeds: number;
  /** Total cost basis of consumed lots */
  costBasis: number;
  /** Per-lot breakdown */
  matchedLots: SimulatedLot[];
  /** Whether a wash sale could be triggered */
  washSaleRisk: boolean;
  /** Estimated disallowed loss amount */
  washSaleDisallowed: number;
  /** Remaining position after hypothetical sale */
  remainingPosition: {
    totalAmount: number;
    totalCostBasis: number;
    avgCostPerUnit: number;
  };
  /** True if not enough lots to cover requested amount */
  insufficientLots: boolean;
  /** Actual amount available for sale */
  availableAmount: number;
}

/**
 * Simulate a hypothetical sale and project its tax impact.
 *
 * Deep-clones the provided lots so the caller's data is never mutated.
 * Uses the existing CostBasisCalculator to match lots according to the
 * chosen method, then analyses per-lot holding periods and optional
 * wash sale risk.
 *
 * @param lots - Current tax lots (will NOT be mutated)
 * @param input - Simulation parameters
 * @param acquisitions - Optional acquisition records for wash sale detection
 * @returns Detailed simulation result
 */
export function simulateSale(
  lots: TaxLot[],
  input: SimulationInput,
  acquisitions?: AcquisitionRecord[],
): SimulationResult {
  // Deep clone to avoid mutating the caller's lots
  const clonedLots: TaxLot[] = structuredClone(lots).map((l: TaxLot) => ({
    ...l,
    acquiredAt: new Date(l.acquiredAt),
  }));

  const saleDate = input.date || new Date();

  // Filter lots matching the target asset (and silo if applicable)
  const matchingLots = clonedLots.filter((l) => {
    if (l.asset !== input.asset) return false;
    if (input.strictSilo && l.sourceId !== input.sourceId) return false;
    return l.amount > 0.00000001;
  });

  const availableAmount = matchingLots.reduce((sum, l) => sum + l.amount, 0);
  const effectiveAmount = Math.min(input.amount, availableAmount);
  const insufficientLots = availableAmount < input.amount - 0.00000001;

  // Create calculator and add ALL cloned lots (calculator filters internally)
  const calculator = new CostBasisCalculator(input.method || "FIFO");
  calculator.addLots(clonedLots);

  // Build the hypothetical taxable event
  const event: TaxableEvent = {
    id: "simulation",
    asset: input.asset,
    amount: effectiveAmount,
    proceedsUsd: effectiveAmount * input.pricePerUnit,
    date: saleDate,
    sourceId: input.sourceId || "simulation",
  };

  // Run the calculation (mutates clonedLots in-place)
  const result: CalculationResult = calculator.calculate(
    event,
    input.strictSilo ?? false,
  );

  // Build per-lot breakdown with individual holding periods
  const simulatedLots: SimulatedLot[] = result.matchedLots.map((ml) => {
    const originalLot = clonedLots.find((l) => l.id === ml.lotId);
    const acquiredAt = originalLot?.acquiredAt ?? saleDate;
    const holdingMs = saleDate.getTime() - acquiredAt.getTime();
    const holdingPeriod: "SHORT_TERM" | "LONG_TERM" =
      holdingMs >= ONE_YEAR_MS ? "LONG_TERM" : "SHORT_TERM";

    // Per-lot gain/loss: proportional proceeds minus cost basis
    const lotProceeds =
      effectiveAmount > 0
        ? (ml.amountConsumed / effectiveAmount) * event.proceedsUsd
        : 0;
    const gainLoss = lotProceeds - ml.costBasisUsd;

    return {
      lotId: ml.lotId,
      amount: ml.amountConsumed,
      costBasis: ml.costBasisUsd,
      acquiredAt,
      holdingPeriod,
      gainLoss,
    };
  });

  // Determine overall holding period
  const periods = new Set(simulatedLots.map((sl) => sl.holdingPeriod));
  let holdingPeriod: "SHORT_TERM" | "LONG_TERM" | "MIXED";
  if (periods.size === 0) {
    holdingPeriod = "SHORT_TERM";
  } else if (periods.size === 1) {
    holdingPeriod = [...periods][0];
  } else {
    holdingPeriod = "MIXED";
  }

  // Aggregate short-term / long-term
  let shortTermGainLoss = 0;
  let longTermGainLoss = 0;
  for (const sl of simulatedLots) {
    if (sl.holdingPeriod === "SHORT_TERM") {
      shortTermGainLoss += sl.gainLoss;
    } else {
      longTermGainLoss += sl.gainLoss;
    }
  }

  // Total cost basis from matched lots
  const totalCostBasis = result.matchedLots.reduce(
    (sum, ml) => sum + ml.costBasisUsd,
    0,
  );

  // Wash sale detection (optional)
  let washSaleRisk = false;
  let washSaleDisallowed = 0;
  if (acquisitions && result.gainLoss < 0) {
    const dispositionLotIds = new Set(result.matchedLots.map((ml) => ml.lotId));
    const washResult = detectWashSales(
      [result],
      acquisitions,
      dispositionLotIds,
    );
    if (washResult.adjustments.length > 0) {
      washSaleRisk = true;
      washSaleDisallowed = washResult.totalDisallowed;
    }
  }

  // Remaining position from the cloned (now mutated) lots
  const remainingLots = clonedLots.filter(
    (l) => l.asset === input.asset && l.amount > 0.00000001,
  );
  const remainingAmount = remainingLots.reduce((sum, l) => sum + l.amount, 0);
  const remainingCostBasis = remainingLots.reduce(
    (sum, l) => sum + l.costBasisUsd,
    0,
  );

  return {
    projectedGainLoss: result.gainLoss,
    holdingPeriod,
    shortTermGainLoss,
    longTermGainLoss,
    proceeds: event.proceedsUsd,
    costBasis: totalCostBasis,
    matchedLots: simulatedLots,
    washSaleRisk,
    washSaleDisallowed,
    remainingPosition: {
      totalAmount: remainingAmount,
      totalCostBasis: remainingCostBasis,
      avgCostPerUnit:
        remainingAmount > 0.00000001 ? remainingCostBasis / remainingAmount : 0,
    },
    insufficientLots,
    availableAmount,
  };
}
