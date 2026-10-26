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
import {
  ukDayIndex,
  ukDayOfLot,
  transferredLotId,
  baseLotId,
} from "./methods/shared";
import type {
  TaxLot,
  TaxableEvent,
  TransferEvent,
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
  /** Transfers between the taxpayer's own wallets, oldest first. */
  private transfers: TransferEvent[] = [];
  private transfersDone = 0;
  /** Latest date of anything applied so far (time never goes backwards). */
  private lastAppliedAt = -Infinity;
  /** Every transfer / consume-only id ever registered (never forgotten). */
  private seenTransferIds = new Set<string>();
  private seenConsumeIds = new Set<string>();
  /** Lots (as bought) that sales have consumed units from. */
  private consumedBySales = new Set<string>();
  /** Disposals that only use up lots (never reported), oldest first. */
  private consumeOnly: TaxableEvent[] = [];
  private consumeOnlyDone = 0;
  private lotsByAsset = new Map<string, TaxLot[]>();
  /** Lots of one asset in one wallet, so a transfer does not scan every lot. */
  private lotsByWallet = new Map<string, TaxLot[]>();
  /** Order lots were added: breaks ties between lots acquired at the same time. */
  private lotSeq = new WeakMap<TaxLot, number>();
  private nextSeq = 0;
  private knownEvents = new Map<string, TaxableEvent>();
  /** Known disposals per asset, ascending by UK day; rebuilt lazily. */
  private eventIndex: Map<
    string,
    { day: number; event: TaxableEvent }[]
  > | null = null;

  constructor(method: CostBasisMethod = "FIFO") {
    this.method = method;
  }

  private walletBucket(asset: string, sourceId: string): TaxLot[] {
    const key = `${asset}\u0000${sourceId}`;
    let list = this.lotsByWallet.get(key);
    if (!list) {
      list = [];
      this.lotsByWallet.set(key, list);
    }
    return list;
  }

  /** Order of lots inside a wallet: acquisition time, then the order added. */
  private lotOrder(a: TaxLot, b: TaxLot): number {
    return (
      a.acquiredAt.getTime() - b.acquiredAt.getTime() ||
      (this.lotSeq.get(a) ?? 0) - (this.lotSeq.get(b) ?? 0)
    );
  }

  /** Insert into a wallet's list, keeping it ordered (binary search). */
  private insertSorted(list: TaxLot[], lot: TaxLot): void {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.lotOrder(list[mid], lot) <= 0) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, lot);
  }

  /**
   * Add tax lots (acquisitions). A lot's acquiredAt must not change after it
   * is added: the per-wallet lists are kept sorted by it.
   */
  addLots(lots: TaxLot[]): void {
    for (const lot of lots) {
      this.lots.push(lot);
      const bucket = this.lotsByAsset.get(lot.asset);
      if (bucket) bucket.push(lot);
      else this.lotsByAsset.set(lot.asset, [lot]);
      this.lotSeq.set(lot, this.nextSeq++);
      this.insertSorted(this.walletBucket(lot.asset, lot.sourceId), lot);
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
    const fresh = events.filter((e) => !this.seenConsumeIds.has(e.id));
    this.assertNotBeforeApplied(fresh);
    for (const e of fresh) this.seenConsumeIds.add(e.id);
    const pending = this.consumeOnly.slice(this.consumeOnlyDone);
    this.consumeOnly = [...pending, ...fresh].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    this.consumeOnlyDone = 0;
    this.registerEvents(events);
  }

  /**
   * Events can be added after others have already run, but not dated before
   * anything already applied (a transfer, a consume-only sale or a calculated
   * sale): it would be applied late, against lots that have moved or been used
   * since, and fail silently.
   */
  private assertNotBeforeApplied(fresh: { id: string; date: Date }[]): void {
    const late = fresh.find((e) => e.date.getTime() < this.lastAppliedAt);
    if (late) {
      throw new Error(
        `Event ${late.id} is dated before one that has already been applied; register events before calculating`,
      );
    }
  }

  /**
   * Register transfers between the taxpayer's own wallets. In wallet-by-wallet
   * mode (strictSilo) each one moves lots, with their acquisition date and
   * cost, from the sending to the receiving wallet just before the first
   * calculated disposal that happens after it. Call before any calculate().
   */
  registerTransfers(transfers: TransferEvent[]): void {
    const fresh = transfers.filter((t) => !this.seenTransferIds.has(t.id));
    this.assertNotBeforeApplied(fresh);
    for (const t of fresh) this.seenTransferIds.add(t.id);
    const pending = this.transfers.slice(this.transfersDone);
    this.transfers = [...pending, ...fresh].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    this.transfersDone = 0;
  }

  /**
   * Apply the registered consume-only disposals and (in wallet-by-wallet
   * mode) transfers dated up to `until`. Reported calculations do this
   * themselves; call it directly when only some disposals are calculated
   * through this calculator.
   */
  applyConsumptionUntil(until: Date, strictSilo: boolean = false): void {
    this.advanceTimeline(until, strictSilo);
  }

  /**
   * Bring wallets and lots up to date for `until`: apply, in date order, every
   * registered transfer and consume-only disposal dated up to then. At the same
   * instant a transfer comes first. Without wallet-by-wallet mode transfers are
   * skipped (lots are pooled across wallets, nothing moves).
   */
  private advanceTimeline(until: Date, strictSilo: boolean): void {
    const limit = until.getTime();
    for (;;) {
      const t = strictSilo ? this.transfers[this.transfersDone] : undefined;
      const c = this.consumeOnly[this.consumeOnlyDone];
      const tAt = t && t.date.getTime() <= limit ? t.date.getTime() : Infinity;
      const cAt = c && c.date.getTime() <= limit ? c.date.getTime() : Infinity;
      if (tAt === Infinity && cAt === Infinity) return;
      if (tAt <= cAt) {
        this.moveLots(this.transfers[this.transfersDone++]);
      } else {
        this.calculateOne(this.consumeOnly[this.consumeOnlyDone++], strictSilo);
      }
    }
  }

  /**
   * Move the arrived units between wallets, earliest lots first, and drop the
   * fee units from the sending wallet (their cost is not claimed).
   */
  private moveLots(t: TransferEvent): void {
    this.lastAppliedAt = Math.max(this.lastAppliedAt, t.date.getTime());
    if (t.fromSourceId === t.toSourceId) return;
    let toMove = t.amount;
    let toDrop = t.feeAmount ?? 0;
    const fromList = this.walletBucket(t.asset, t.fromSourceId);
    const limit = t.date.getTime();
    // The list is ordered, so the lots to move are at the front: walk it until
    // everything is placed or the lots become too recent.
    let i = 0;
    while (i < fromList.length && (toMove > 1e-12 || toDrop > 1e-12)) {
      const lot = fromList[i];
      if (lot.amount <= 1e-12) {
        fromList.splice(i, 1); // used up: drop it from the index
        continue;
      }
      if (lot.acquiredAt.getTime() > limit) break;
      if (toMove > 1e-12) {
        if (lot.amount <= toMove + 1e-12) {
          toMove -= lot.amount;
          lot.sourceId = t.toSourceId; // the whole lot moves
          fromList.splice(i, 1);
          this.insertSorted(this.walletBucket(t.asset, t.toSourceId), lot);
          continue;
        }
        const share = toMove / lot.amount;
        const cost = lot.costBasisUsd * share;
        const moved: TaxLot = {
          ...lot,
          id: transferredLotId(lot.id, t.id),
          amount: toMove,
          costBasisUsd: cost,
          sourceId: t.toSourceId,
        };
        lot.amount -= toMove;
        lot.costBasisUsd -= cost;
        this.addLots([moved]);
        toMove = 0;
      }
      if (toDrop > 1e-12 && lot.amount > 1e-12) {
        const take = Math.min(lot.amount, toDrop);
        lot.costBasisUsd -= lot.costBasisUsd * (take / lot.amount);
        lot.amount -= take;
        toDrop -= take;
      }
      i++;
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
    this.advanceTimeline(event.date, strictSilo);
    return this.calculateOne(event, strictSilo);
  }

  private calculateOne(
    event: TaxableEvent,
    strictSilo: boolean,
  ): CalculationResult {
    this.lastAppliedAt = Math.max(this.lastAppliedAt, event.date.getTime());
    const result = this.dispatch(event, strictSilo);
    this.noteConsumed(result);
    return result;
  }

  private noteConsumed(result: CalculationResult): void {
    for (const m of result.matchedLots) {
      if (m.amountConsumed > 0) this.consumedBySales.add(baseLotId(m.lotId));
    }
  }

  /**
   * Lots (as bought) that any calculated sale has taken units from. Moving
   * coins between wallets or paying a network fee does not count.
   */
  consumedLotIds(): Set<string> {
    return new Set(this.consumedBySales);
  }

  private dispatch(
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
    this.advanceTimeline(event.date, false);
    this.lastAppliedAt = Math.max(this.lastAppliedAt, event.date.getTime());
    const result = calculateSpecificId(
      this.eligibleLots(event),
      event,
      selections,
    );
    this.noteConsumed(result);
    return result;
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
