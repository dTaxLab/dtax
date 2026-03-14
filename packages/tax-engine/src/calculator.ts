/**
 * CostBasisCalculator — unified entry point for tax calculations.
 *
 * Supports built-in methods (FIFO, LIFO, HIFO, SPECIFIC_ID) and
 * custom strategies via registerStrategy() for international tax
 * methods (e.g., weighted average, moving average).
 *
 * @license AGPL-3.0
 */

import { calculateFIFO } from "./methods/fifo";
import { calculateLIFO } from "./methods/lifo";
import { calculateHIFO } from "./methods/hifo";
import { calculateSpecificId } from "./methods/specific-id";
import type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  CostBasisMethod,
  CostBasisStrategy,
  LotSelection,
} from "./types";

/** Global registry of custom strategies */
const strategyRegistry = new Map<string, CostBasisStrategy>();

/**
 * Register a custom cost basis calculation strategy.
 *
 * @example
 * ```typescript
 * registerStrategy({
 *   name: "WEIGHTED_AVG",
 *   calculate(lots, event, strictSilo) { ... }
 * });
 * const calc = new CostBasisCalculator("WEIGHTED_AVG");
 * ```
 */
export function registerStrategy(strategy: CostBasisStrategy): void {
  strategyRegistry.set(strategy.name, strategy);
}

/** Get a registered custom strategy by name */
export function getStrategy(name: string): CostBasisStrategy | undefined {
  return strategyRegistry.get(name);
}

/** List all registered custom strategy names */
export function getRegisteredStrategies(): string[] {
  return Array.from(strategyRegistry.keys());
}

export class CostBasisCalculator {
  private method: CostBasisMethod;
  private lots: TaxLot[] = [];

  constructor(method: CostBasisMethod = "FIFO") {
    this.method = method;
  }

  /** Add tax lots (acquisitions) */
  addLots(lots: TaxLot[]): void {
    this.lots.push(...lots);
  }

  /** Calculate gains/losses for a taxable event */
  calculate(
    event: TaxableEvent,
    strictSilo: boolean = false,
  ): CalculationResult {
    switch (this.method) {
      case "FIFO":
        return calculateFIFO(this.lots, event, strictSilo);
      case "LIFO":
        return calculateLIFO(this.lots, event, strictSilo);
      case "HIFO":
        return calculateHIFO(this.lots, event, strictSilo);
      case "SPECIFIC_ID":
        throw new Error(
          "SPECIFIC_ID requires lot selections — use calculateSpecificId()",
        );
      default: {
        // Check custom strategy registry
        const strategy = strategyRegistry.get(this.method);
        if (strategy) {
          return strategy.calculate(this.lots, event, strictSilo);
        }
        throw new Error(`Unknown method: ${this.method}`);
      }
    }
  }

  /** Calculate using Specific ID with user-selected lots */
  calculateSpecificId(
    event: TaxableEvent,
    selections: LotSelection[],
  ): CalculationResult {
    return calculateSpecificId(this.lots, event, selections);
  }

  /** Get current method */
  getMethod(): CostBasisMethod {
    return this.method;
  }

  /** Set calculation method */
  setMethod(method: CostBasisMethod): void {
    this.method = method;
  }

  /** Get all current lots */
  getLots(): TaxLot[] {
    return [...this.lots];
  }
}
