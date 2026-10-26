/**
 * UK share pooling: HMRC same-day and 30-day (bed & breakfasting) matching.
 * Order: same-day → 30-day → Section 104 pool. Exercised through
 * CostBasisCalculator, the entry used by the API and CLI.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import type { TaxLot, TaxableEvent } from "../types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const lot = (
  id: string,
  amount: number,
  cost: number,
  day: string,
): TaxLot => ({
  id,
  asset: "BTC",
  amount,
  costBasisUsd: cost,
  acquiredAt: d(day),
  sourceId: "s1",
});
const sale = (
  id: string,
  amount: number,
  proceeds: number,
  day: string,
): TaxableEvent => ({
  id,
  asset: "BTC",
  amount,
  proceedsUsd: proceeds,
  date: d(day),
  sourceId: "s1",
});
const uk = (lots: TaxLot[]) => {
  const c = new CostBasisCalculator("UK_SHARE_POOLING");
  c.addLots(lots);
  return c;
};

describe("UK same-day rule", () => {
  it("matches a same-day acquisition at its own cost, not the pool", () => {
    const c = uk([
      lot("pool", 1, 10000, "2025-01-01"),
      lot("sd", 1, 30000, "2025-06-01"),
    ]);
    const r = c.calculate(sale("S", 1, 35000, "2025-06-01"));
    expect(r.matchedLots.map((m) => [m.lotId, m.rule])).toEqual([
      ["sd", "SAME_DAY"],
    ]);
    expect(r.gainLoss).toBe(5000);
  });

  it("a same-day buy later in the day than the sale still matches", () => {
    const buy = lot("sd", 1, 30000, "2025-06-01");
    buy.acquiredAt = new Date("2025-06-01T20:00:00Z");
    const s = sale("S", 1, 35000, "2025-06-01");
    s.date = new Date("2025-06-01T08:00:00Z");
    const r = uk([lot("pool", 1, 10000, "2025-01-01"), buy]).calculate(s);
    expect(r.matchedLots[0].rule).toBe("SAME_DAY");
    expect(r.gainLoss).toBe(5000);
  });
});

describe("UK 30-day (bed & breakfasting) rule", () => {
  it("matches a rebuy within 30 days at the rebuy cost", () => {
    const c = uk([
      lot("pool", 1, 10000, "2025-01-01"),
      lot("bb", 1, 32000, "2025-06-20"),
    ]);
    const r = c.calculate(sale("S", 1, 35000, "2025-06-01"));
    expect(r.matchedLots.map((m) => [m.lotId, m.rule])).toEqual([
      ["bb", "THIRTY_DAY"],
    ]);
    expect(r.gainLoss).toBe(3000);
  });

  it("window includes day 30 and excludes day 31 (positive and negative control)", () => {
    const day30 = uk([
      lot("pool", 1, 10000, "2025-01-01"),
      lot("bb", 1, 32000, "2025-07-01"),
    ]);
    expect(
      day30.calculate(sale("S", 1, 35000, "2025-06-01")).matchedLots[0].rule,
    ).toBe("THIRTY_DAY");
    const day31 = uk([
      lot("pool", 1, 10000, "2025-01-01"),
      lot("late", 1, 32000, "2025-07-02"),
    ]);
    const r = day31.calculate(sale("S", 1, 35000, "2025-06-01"));
    expect(r.matchedLots[0]).toMatchObject({
      lotId: "pool",
      rule: "SECTION_104",
    });
    expect(r.gainLoss).toBe(25000);
  });

  it("matched quantity never enters the pool afterwards", () => {
    const c = uk([
      lot("pool", 1, 10000, "2025-01-01"),
      lot("bb", 1, 32000, "2025-06-20"),
    ]);
    c.calculate(sale("S1", 1, 35000, "2025-06-01"));
    // After the rebuy was matched to S1, only the 10000 holding remains.
    const r = c.calculate(sale("S2", 1, 40000, "2025-08-01"));
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["pool"]);
    expect(r.gainLoss).toBe(30000);
    expect(r.unmatchedAmount ?? 0).toBe(0);
  });

  it("a disposal between sale and rebuy still sees the pool without the rebuy", () => {
    const c = uk([
      lot("pool", 2, 20000, "2025-01-01"),
      lot("bb", 1, 32000, "2025-06-20"),
    ]);
    c.calculate(sale("S1", 1, 35000, "2025-06-01")); // matched to bb
    const r = c.calculate(sale("S2", 1, 36000, "2025-06-10")); // bb not yet acquired
    expect(r.matchedLots[0]).toMatchObject({
      lotId: "pool",
      rule: "SECTION_104",
    });
    expect(r.gainLoss).toBe(26000);
  });
});

describe("UK identification order and splits", () => {
  it("splits one disposal across same-day, 30-day and pool in HMRC order", () => {
    const c = uk([
      lot("pool", 2, 20000, "2025-01-01"),
      lot("bb", 1, 32000, "2025-06-15"),
      lot("sd", 1, 30000, "2025-06-01"),
    ]);
    const r = c.calculate(sale("S", 3, 105000, "2025-06-01"));
    expect(
      r.matchedLots.map((m) => [m.lotId, m.rule, m.amountConsumed]),
    ).toEqual([
      ["sd", "SAME_DAY", 1],
      ["bb", "THIRTY_DAY", 1],
      ["pool", "SECTION_104", 1],
    ]);
    expect(r.gainLoss).toBe(105000 - 30000 - 32000 - 10000);
  });

  it("pool cost uses the weighted average of earlier holdings only", () => {
    const c = uk([
      lot("a", 1, 10000, "2025-01-01"),
      lot("b", 1, 30000, "2025-02-01"),
      lot("later", 1, 90000, "2025-12-01"), // beyond 30 days: must not dilute
    ]);
    const r = c.calculate(sale("S", 1, 50000, "2025-06-01"));
    expect(r.gainLoss).toBe(50000 - 20000);
  });
});

describe("UK pool accounting", () => {
  it("pool average does not drift across successive disposals", () => {
    const c = uk([
      lot("A", 1, 100, "2025-01-01"),
      lot("B", 1, 200, "2025-01-02"),
    ]);
    const r1 = c.calculate(sale("S1", 1, 300, "2025-03-01"));
    const r2 = c.calculate(sale("S2", 1, 300, "2025-04-01"));
    expect(r1.gainLoss).toBe(150); // 300 - 150
    expect(r2.gainLoss).toBe(150); // 300 - 150, total cost 300 = 100 + 200
  });
});

describe("same-day priority over an earlier disposal's 30-day match", () => {
  it("keeps the lot for the later same-day disposal (HMRC order across disposals)", () => {
    const c = uk([
      lot("P", 10, 1000, "2025-01-01"),
      lot("L", 1, 50, "2025-03-10"),
    ]);
    const d1 = sale("D1", 1, 200, "2025-03-01");
    const d2 = sale("D2", 1, 200, "2025-03-10");
    c.registerEvents([d1, d2]);
    const r1 = c.calculate(d1);
    const r2 = c.calculate(d2);
    expect(r1.matchedLots[0]).toMatchObject({
      lotId: "P",
      rule: "SECTION_104",
    });
    expect(r1.gainLoss).toBe(200 - 100);
    expect(r2.matchedLots[0]).toMatchObject({ lotId: "L", rule: "SAME_DAY" });
    expect(r2.gainLoss).toBe(200 - 50);
  });

  // Negative control: without knowing the later disposal the 30-day match wins.
  it("without registered events the earlier disposal takes the lot", () => {
    const c = uk([
      lot("P", 10, 1000, "2025-01-01"),
      lot("L", 1, 50, "2025-03-10"),
    ]);
    expect(
      c.calculate(sale("D1", 1, 200, "2025-03-01")).matchedLots[0].rule,
    ).toBe("THIRTY_DAY");
  });
});

describe("UK calendar days", () => {
  it("a buy at 23:30Z in summer is the next UK day: same-day with a 09:00Z sale", () => {
    const l = lot("L", 1, 500, "2025-06-01");
    l.acquiredAt = new Date("2025-06-01T23:30:00Z"); // 00:30 BST on 2 June
    const s = sale("S", 1, 600, "2025-06-02");
    s.date = new Date("2025-06-02T09:00:00Z");
    const r = uk([lot("P", 1, 100, "2025-01-01"), l]).calculate(s);
    expect(r.matchedLots[0]).toMatchObject({ lotId: "L", rule: "SAME_DAY" });
    expect(r.gainLoss).toBe(100);
  });
});
