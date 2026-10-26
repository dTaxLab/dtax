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
import { calculateGermanyFIFO } from "./methods/germany-fifo";
import { calculatePMPA } from "./methods/pmpa";
import { calculateTotalAverage } from "./methods/total-average";
import {
  calculateUKSharePooling,
  UK_THIRTY_DAY_WINDOW,
} from "./methods/uk-share-pooling";

import { calculateAustraliaCGT } from "./methods/australia-cgt";
import { calculateCanadaACB } from "./methods/canada-acb";
import { calculateKoreaVirtualAsset } from "./methods/korea-virtual-asset";
import { calculateIndiaVDA } from "./methods/india-vda";
import { calculateSpainCGT } from "./methods/spain-cgt";
import { ukDayIndex } from "./methods/shared";
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
  private knownEvents: TaxableEvent[] = [];
  private processedEventIds = new Set<string>();

  constructor(method: CostBasisMethod = "FIFO") {
    this.method = method;
  }

  /** Add tax lots (acquisitions) */
  addLots(lots: TaxLot[]): void {
    this.lots.push(...lots);
  }

  /**
   * Lots a disposal may consume: only those acquired at or before the
   * disposal time. Lots are shared by reference, so consumption by a method
   * is still tracked on the calculator's own lots.
   */
  private eligibleLots(event: TaxableEvent): TaxLot[] {
    // UK share pooling also matches acquisitions up to 30 UK days after the
    // disposal day (same-day / 30-day rules); it applies those rules itself.
    if (this.method === "UK_SHARE_POOLING") {
      const lastDay = ukDayIndex(event.date) + UK_THIRTY_DAY_WINDOW;
      return this.lots.filter((lot) => ukDayIndex(lot.acquiredAt) <= lastDay);
    }
    const cutoff = event.date.getTime();
    return this.lots.filter((lot) => lot.acquiredAt.getTime() <= cutoff);
  }

  /**
   * Make later disposals known to the calculator. Only UK share pooling uses
   * them: a disposal on the day a lot was acquired has priority (same-day
   * rule) over an earlier disposal's 30-day match to that lot. Pass the
   * disposals of the period being calculated plus those up to 30 days after.
   */
  registerEvents(events: TaxableEvent[]): void {
    this.knownEvents.push(...events);
  }

  /** Calculate gains/losses for a taxable event */
  calculate(
    event: TaxableEvent,
    strictSilo: boolean = false,
  ): CalculationResult {
    const lots = this.eligibleLots(event);
    this.processedEventIds.add(event.id);
    switch (this.method) {
      case "FIFO":
        return calculateFIFO(lots, event, strictSilo);
      case "LIFO":
        return calculateLIFO(lots, event, strictSilo);
      case "HIFO":
        return calculateHIFO(lots, event, strictSilo);
      case "GERMANY_FIFO":
        return calculateGermanyFIFO(lots, event, strictSilo);
      case "PMPA":
        return calculatePMPA(lots, event, strictSilo);
      case "TOTAL_AVERAGE":
        return calculateTotalAverage(lots, event, strictSilo);
      case "UK_SHARE_POOLING":
        return calculateUKSharePooling(
          lots,
          event,
          strictSilo,
          this.knownEvents.filter((e) => !this.processedEventIds.has(e.id)),
        );
      case "AU_CGT_DISCOUNT":
        return calculateAustraliaCGT(lots, event, strictSilo);
      case "CA_ACB":
        return calculateCanadaACB(lots, event, strictSilo);
      case "KR_VIRTUAL_ASSET":
        return calculateKoreaVirtualAsset(lots, event, strictSilo);
      case "IN_VDA":
        return calculateIndiaVDA(lots, event, strictSilo);
      case "ES_CGT":
        return calculateSpainCGT(lots, event, strictSilo);
      case "SPECIFIC_ID":
        throw new Error(
          "SPECIFIC_ID requires lot selections — use calculateSpecificId()",
        );
      default: {
        // Check custom strategy registry
        const strategy = strategyRegistry.get(this.method);
        if (strategy) {
          return strategy.calculate(lots, event, strictSilo);
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
    return calculateSpecificId(this.eligibleLots(event), event, selections);
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
