/**
 * The asset-scoped, binary-searched eligible-lot path must give exactly the
 * results of handing a method every lot acquired at or before the disposal
 * (the previous full-scan behaviour), for every built-in method, including
 * out-of-order lot insertion and equal cost-per-unit ties.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import { calculateFIFO } from "../methods/fifo";
import { calculateLIFO } from "../methods/lifo";
import { calculateHIFO } from "../methods/hifo";
import { calculateGermanyFIFO } from "../methods/germany-fifo";
import { calculatePMPA } from "../methods/pmpa";
import { calculateTotalAverage } from "../methods/total-average";
import { calculateAustraliaCGT } from "../methods/australia-cgt";
import { calculateCanadaACB } from "../methods/canada-acb";
import type {
  CostBasisMethod,
  TaxLot,
  TaxableEvent,
  CalculationResult,
} from "../types";

type Fn = (
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean,
) => CalculationResult;

const REFERENCE: Partial<Record<CostBasisMethod, Fn>> = {
  FIFO: calculateFIFO,
  LIFO: calculateLIFO,
  HIFO: calculateHIFO,
  GERMANY_FIFO: calculateGermanyFIFO,
  PMPA: calculatePMPA,
  TOTAL_AVERAGE: calculateTotalAverage,
  AU_CGT_DISCOUNT: calculateAustraliaCGT,
  CA_ACB: calculateCanadaACB,
};

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);

function scenario(seed: number, chronological: boolean) {
  const r = rng(seed);
  const assets = ["BTC", "ETH", "SOL"];
  const lots: TaxLot[] = [];
  const n = 6 + Math.floor(r() * 25);
  for (let i = 0; i < n; i++) {
    const day = chronological ? i : Math.floor(r() * 40);
    lots.push({
      id: `l${i}`,
      asset: assets[Math.floor(r() * assets.length)],
      amount: 1 + Math.floor(r() * 4),
      // few distinct cost-per-unit values -> HIFO ties
      costBasisUsd: (1 + Math.floor(r() * 3)) * 100 * (1 + Math.floor(r() * 4)),
      acquiredAt: new Date(T0 + day * DAY),
      sourceId: `w${Math.floor(r() * 2)}`,
    });
  }
  const events: TaxableEvent[] = [];
  for (let i = 0; i < 10; i++) {
    events.push({
      id: `e${i}`,
      asset: assets[Math.floor(r() * assets.length)],
      amount: 0.5 + Math.floor(r() * 3),
      proceedsUsd: 500 + Math.floor(r() * 2000),
      date: new Date(T0 + (5 + i * 4) * DAY),
      sourceId: `w${Math.floor(r() * 2)}`,
    });
  }
  return { lots, events };
}

const clone = (lots: TaxLot[]): TaxLot[] =>
  lots.map((l) => ({ ...l, acquiredAt: new Date(l.acquiredAt) }));

const summarize = (res: CalculationResult) => ({
  gainLoss: res.gainLoss,
  proceeds: res.proceeds,
  costBasis: res.costBasis,
  unmatched: res.unmatchedAmount ?? 0,
  matched: res.matchedLots.map((m) => [m.lotId, m.amountConsumed]),
});

describe("eligible-lot index equals the full-scan result", () => {
  for (const [method, fn] of Object.entries(REFERENCE)) {
    for (const chronological of [true, false]) {
      it(`${method} (${chronological ? "chronological" : "out-of-order"} lots), 60 random scenarios`, () => {
        for (let seed = 1; seed <= 60; seed++) {
          const { lots, events } = scenario(seed, chronological);
          const calc = new CostBasisCalculator(method as CostBasisMethod);
          calc.addLots(clone(lots));
          const refLots = clone(lots);
          for (const e of events) {
            const cutoff = e.date.getTime();
            const expected = fn(
              refLots.filter((l) => l.acquiredAt.getTime() <= cutoff),
              e,
              false,
            );
            const got = calc.calculate(e);
            expect(summarize(got), `seed ${seed} ${e.id}`).toEqual(
              summarize(expected),
            );
          }
        }
      });
    }
  }

  it("lots added later but dated earlier are still found (chronological flag drops)", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      {
        id: "late",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 200,
        acquiredAt: new Date(T0 + 10 * DAY),
        sourceId: "w",
      },
    ]);
    calc.addLots([
      {
        id: "early",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 100,
        acquiredAt: new Date(T0 + 1 * DAY),
        sourceId: "w",
      },
    ]);
    const r = calc.calculate({
      id: "e",
      asset: "BTC",
      amount: 1,
      proceedsUsd: 500,
      date: new Date(T0 + 20 * DAY),
      sourceId: "w",
    });
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["early"]);
  });

  // More calculations than the list of lots with units left is rebuilt after
  // (256): exhausted lots drop out of the view, results must not change.
  for (const method of ["FIFO", "LIFO", "HIFO", "PMPA"] as const) {
    it(`${method}: 700 sales over 700 lots (rebuilds of the active list) match the full scan`, () => {
      const r = rng(99);
      const lots: TaxLot[] = Array.from({ length: 700 }, (_, i) => ({
        id: `b${i}`,
        asset: "BTC",
        amount: 1 + Math.floor(r() * 2),
        costBasisUsd: (1 + Math.floor(r() * 4)) * 100,
        acquiredAt: new Date(T0 + i * 3_600_000),
        sourceId: "w",
      }));
      const calc = new CostBasisCalculator(method);
      calc.addLots(clone(lots));
      const refLots = clone(lots);
      const fn = REFERENCE[method]!;
      for (let i = 0; i < 700; i++) {
        // lots acquired later keep arriving between sales
        if (i % 100 === 50) {
          const extra: TaxLot = {
            id: `x${i}`,
            asset: "BTC",
            amount: 2,
            costBasisUsd: 250,
            acquiredAt: new Date(T0 + (700 + i) * 3_600_000),
            sourceId: "w",
          };
          calc.addLots(clone([extra]));
          refLots.push({ ...extra, acquiredAt: new Date(extra.acquiredAt) });
        }
        const e: TaxableEvent = {
          id: `s${i}`,
          asset: "BTC",
          amount: 1 + Math.floor(r() * 2),
          proceedsUsd: 500,
          date: new Date(T0 + (800 + i) * 3_600_000),
          sourceId: "w",
        };
        const cutoff = e.date.getTime();
        const expected = fn(
          refLots.filter((l) => l.acquiredAt.getTime() <= cutoff),
          e,
          false,
        );
        expect(summarize(calc.calculate(e)), `sale ${i}`).toEqual(
          summarize(expected),
        );
      }
    });
  }
});

// FIFO keeps its own always-sorted view, so partial wallet transfers (which add
// older-dated lots later) do not push it onto a slow path. KR_VIRTUAL_ASSET is
// FIFO sorting for itself on the plain asset list, so the two must agree.
describe("FIFO sorted view equals FIFO with transfers (wallet-by-wallet)", () => {
  it("120 random scenarios with partial transfers, fees and ties", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed * 7919);
      const lots: TaxLot[] = Array.from(
        { length: 5 + Math.floor(r() * 12) },
        (_, i) => ({
          id: `t${i}`,
          asset: r() < 0.8 ? "BTC" : "ETH",
          amount: 1 + Math.floor(r() * 4),
          costBasisUsd: 100 * (1 + Math.floor(r() * 5)),
          acquiredAt: new Date(T0 + Math.floor(r() * 30) * DAY),
          sourceId: `w${Math.floor(r() * 3)}`,
        }),
      );
      const transfers = Array.from({ length: 4 }, (_, i) => ({
        id: `tr${i}`,
        asset: "BTC",
        amount: 0.5 + Math.floor(r() * 3),
        feeAmount: r() < 0.5 ? 0.01 : undefined,
        date: new Date(T0 + (35 + i * 3) * DAY),
        fromSourceId: `w${Math.floor(r() * 3)}`,
        toSourceId: `w${Math.floor(r() * 3)}`,
      })).filter((t) => t.fromSourceId !== t.toSourceId);
      const sales: TaxableEvent[] = Array.from({ length: 12 }, (_, i) => ({
        id: `s${i}`,
        asset: r() < 0.8 ? "BTC" : "ETH",
        amount: 0.5 + Math.floor(r() * 3),
        proceedsUsd: 300,
        date: new Date(T0 + (32 + i * 2) * DAY),
        sourceId: `w${Math.floor(r() * 3)}`,
      }));
      const run = (method: CostBasisMethod) => {
        const c = new CostBasisCalculator(method);
        c.addLots(clone(lots));
        c.registerTransfers(transfers);
        return sales.map((e) => {
          const res = c.calculate(e, true);
          return {
            gainLoss: res.gainLoss,
            unmatched: res.unmatchedAmount ?? 0,
            matched: res.matchedLots.map((m) => [m.lotId, m.amountConsumed]),
          };
        });
      };
      expect(run("FIFO"), `seed ${seed}`).toEqual(run("KR_VIRTUAL_ASSET"));
    }
  });
});
