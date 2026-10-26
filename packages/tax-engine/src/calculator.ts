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
import { ukDayIndex, ukDayOfLot } from "./methods/shared";
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
  /** Disposals that only use up lots (never reported), oldest first. */
  private consumeOnly: TaxableEvent[] = [];
  private consumeOnlyDone = 0;
  private lotsByAsset = new Map<string, TaxLot[]>();
  private knownEvents = new Map<string, TaxableEvent>();
  /** Known disposals per asset, ascending by UK day; rebuilt lazily. */
  private eventIndex: Map<
    string,
    { day: number; event: TaxableEvent }[]
  > | null = null;

  constructor(method: CostBasisMethod = "FIFO") {
    this.method = method;
  }

  /** Add tax lots (acquisitions) */
  addLots(lots: TaxLot[]): void {
    for (const lot of lots) {
      this.lots.push(lot);
      const bucket = this.lotsByAsset.get(lot.asset);
      if (bucket) bucket.push(lot);
      else this.lotsByAsset.set(lot.asset, [lot]);
    }
  }

  /**
   * Lots a disposal may consume: only those acquired at or before the
   * disposal time. Lots are shared by reference, so consumption by a method
   * is still tracked on the calculator's own lots.
   */
  private eligibleLots(event: TaxableEvent): TaxLot[] {
    // UK share pooling also matches acquisitions up to 30 UK days after the
    // disposal day (same-day / 30-day rules); it applies those rules itself.
    // It only ever looks at the disposed asset, so hand it just that bucket.
    if (this.method === "UK_SHARE_POOLING") {
      const lastDay = ukDayIndex(event.date) + UK_THIRTY_DAY_WINDOW;
      return (this.lotsByAsset.get(event.asset) ?? []).filter(
        (lot) => ukDayOfLot(lot) <= lastDay,
      );
    }
    const cutoff = event.date.getTime();
    return this.lots.filter((lot) => lot.acquiredAt.getTime() <= cutoff);
  }

  /**
   * Make later disposals known to the calculator. Only UK share pooling uses
   * them: a disposal on the day a lot was acquired has priority (same-day
   * rule) over an earlier disposal's 30-day match to that lot. Pass the
   * disposals of the period being calculated plus those up to 30 days after.
   * Registering the same event id again is a no-op.
   */
  registerEvents(events: TaxableEvent[]): void {
    for (const e of events) {
      const known = this.knownEvents.get(e.id);
      if (
        known &&
        known !== e &&
        (known.date.getTime() !== e.date.getTime() ||
          known.amount !== e.amount ||
          known.asset !== e.asset)
      ) {
        throw new Error(
          `registerEvents: two different disposals share id ${e.id}`,
        );
      }
      this.knownEvents.set(e.id, e);
    }
    this.eventIndex = null;
  }

  /**
   * Disposals that must use up lots but are not reported (for example a sale
   * without a price): they are applied, in date order, just before the first
   * calculated disposal that happens after them. Call before any calculate().
   */
  registerConsumptionEvents(events: TaxableEvent[]): void {
    const pending = this.consumeOnly.slice(this.consumeOnlyDone);
    this.consumeOnly = [...pending, ...events].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    this.consumeOnlyDone = 0;
    this.registerEvents(events);
  }

  private drainConsumption(until: Date, strictSilo: boolean): void {
    while (
      this.consumeOnlyDone < this.consumeOnly.length &&
      this.consumeOnly[this.consumeOnlyDone].date.getTime() <= until.getTime()
    ) {
      const e = this.consumeOnly[this.consumeOnlyDone++];
      this.calculateOne(e, strictSilo);
    }
  }

  /** Known disposals of the asset in the 30 UK days after the event's day. */
  private laterDisposals(event: TaxableEvent): TaxableEvent[] {
    if (this.knownEvents.size === 0) return [];
    if (!this.eventIndex) {
      const index = new Map<string, { day: number; event: TaxableEvent }[]>();
      for (const e of this.knownEvents.values()) {
        const list = index.get(e.asset) ?? [];
        list.push({ day: ukDayIndex(e.date), event: e });
        index.set(e.asset, list);
      }
      for (const list of index.values()) list.sort((a, b) => a.day - b.day);
      this.eventIndex = index;
    }
    const list = this.eventIndex.get(event.asset);
    if (!list) return [];
    const from = ukDayIndex(event.date) + 1;
    const to = from - 1 + UK_THIRTY_DAY_WINDOW;
    // first index with day >= from (binary search), then take the window
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].day < from) lo = mid + 1;
      else hi = mid;
    }
    const out: TaxableEvent[] = [];
    for (let i = lo; i < list.length && list[i].day <= to; i++) {
      out.push(list[i].event);
    }
    return out;
  }

  /** Calculate gains/losses for a taxable event */
  calculate(
    event: TaxableEvent,
    strictSilo: boolean = false,
  ): CalculationResult {
    this.drainConsumption(event.date, strictSilo);
    return this.calculateOne(event, strictSilo);
  }

  private calculateOne(
    event: TaxableEvent,
    strictSilo: boolean,
  ): CalculationResult {
    const lots = this.eligibleLots(event);
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
          this.laterDisposals(event),
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
    this.drainConsumption(event.date, false);
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
