/**
 * Lot eligibility by date: a disposal may only consume lots acquired at or
 * before the disposal time. Lots acquired later must never set its cost basis
 * nor mask an incomplete cost basis (unmatchedAmount).
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { CostBasisCalculator } from "../calculator";
import type { TaxLot, TaxableEvent, CostBasisMethod } from "../types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const earlyLot = (): TaxLot => ({
  id: "A-early",
  asset: "BTC",
  amount: 1,
  costBasisUsd: 40000,
  acquiredAt: d("2025-01-10"),
  sourceId: "s1",
});
const lateLot = (): TaxLot => ({
  id: "B-after-sale",
  asset: "BTC",
  amount: 1,
  costBasisUsd: 90000,
  acquiredAt: d("2025-12-01"),
  sourceId: "s1",
});
const sale = (date = "2025-06-01", amount = 1): TaxableEvent => ({
  id: "E1",
  asset: "BTC",
  amount,
  proceedsUsd: 60000,
  date: d(date),
  sourceId: "s1",
});

const METHODS: CostBasisMethod[] = [
  "FIFO",
  "LIFO",
  "HIFO",
  "UK_SHARE_POOLING",
  "TOTAL_AVERAGE",
  "PMPA",
];

describe("lot eligibility by date", () => {
  for (const method of METHODS) {
    it(`${method}: ignores lots acquired after the disposal`, () => {
      const calc = new CostBasisCalculator(method);
      calc.addLots([earlyLot(), lateLot()]);
      const r = calc.calculate(sale());
      expect(r.matchedLots.map((m) => m.lotId)).toEqual(["A-early"]);
      expect(r.gainLoss).toBe(20000);
      expect(r.unmatchedAmount ?? 0).toBe(0);
    });

    it(`${method}: only future lots → unmatchedAmount, not future cost`, () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const calc = new CostBasisCalculator(method);
      calc.addLots([lateLot()]);
      const r = calc.calculate(sale());
      expect(r.matchedLots).toEqual([]);
      expect(r.unmatchedAmount).toBe(1);
    });
  }

  it("UK pool is not diluted by a later, higher-cost acquisition", () => {
    const calc = new CostBasisCalculator("UK_SHARE_POOLING");
    calc.addLots([earlyLot(), lateLot()]);
    // Half of the early lot: pool as of 6/1 is 1 BTC @ 40000
    const r = calc.calculate(sale("2025-06-01", 0.5));
    expect(r.gainLoss).toBe(60000 - 20000);
  });

  // Negative control: an acquisition on or before the disposal still counts,
  // and lots stay available for later disposals once their date has passed.
  it("lot acquired exactly at disposal time is eligible", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([{ ...lateLot(), acquiredAt: d("2025-06-01") }]);
    const r = calc.calculate(sale());
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["B-after-sale"]);
    expect(r.unmatchedAmount ?? 0).toBe(0);
  });

  it("later disposal can use a lot that was ineligible for an earlier one", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([earlyLot(), lateLot()]);
    calc.calculate(sale("2025-06-01"));
    const r = calc.calculate({ ...sale("2025-12-15"), id: "E2" });
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["B-after-sale"]);
    expect(r.unmatchedAmount ?? 0).toBe(0);
  });

  it("SPECIFIC_ID cannot select a lot acquired after the disposal", () => {
    const calc = new CostBasisCalculator("SPECIFIC_ID");
    calc.addLots([earlyLot(), lateLot()]);
    expect(() =>
      calc.calculateSpecificId(sale(), [{ lotId: "B-after-sale", amount: 1 }]),
    ).toThrow(/not found/);
  });
});

describe("disposals that only consume lots", () => {
  it("a consume-only sale uses its lot before a later reported sale", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([earlyLot(), { ...lateLot(), acquiredAt: d("2025-02-01") }]);
    c.registerConsumptionEvents([
      { ...sale("2025-03-01"), id: "UNPRICED", proceedsUsd: 0 },
    ]);
    const r = c.calculate({ ...sale("2025-06-01"), id: "REPORTED" });
    // the unpriced March sale took the early lot; the June sale gets the later one
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["B-after-sale"]);
  });

  // Negative control: without it the reported sale would use the early lot.
  it("without the consume-only sale the reported sale takes the early lot", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([earlyLot(), { ...lateLot(), acquiredAt: d("2025-02-01") }]);
    const r = c.calculate({ ...sale("2025-06-01"), id: "REPORTED" });
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["A-early"]);
  });

  it("a consume-only sale after the reported one is not applied yet", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([earlyLot()]);
    c.registerConsumptionEvents([
      { ...sale("2025-09-01"), id: "LATER", proceedsUsd: 0 },
    ]);
    const r = c.calculate({ ...sale("2025-06-01"), id: "REPORTED" });
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["A-early"]);
    expect(r.unmatchedAmount ?? 0).toBe(0);
  });

  it("registering consume-only sales twice keeps both", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([
      earlyLot(),
      { ...lateLot(), id: "B", acquiredAt: d("2025-02-01") },
      { ...lateLot(), id: "C", acquiredAt: d("2025-02-02") },
    ]);
    c.registerConsumptionEvents([
      { ...sale("2025-03-01"), id: "U1", proceedsUsd: 0 },
    ]);
    c.registerConsumptionEvents([
      { ...sale("2025-03-02"), id: "U2", proceedsUsd: 0 },
    ]);
    const r = c.calculate({ ...sale("2025-06-01"), id: "REPORTED" });
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["C"]); // A and B used by U1, U2
  });
});
