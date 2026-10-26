/**
 * HMRC's own worked examples (Cryptoassets Manual, Capital Gains Tax pooling
 * examples CRYPTO22253, CRYPTO22254, CRYPTO22255) run through the engine.
 * The figures are HMRC's; HMRC rounds pence, the engine does not.
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
  asset: "TOK",
  amount,
  costBasisUsd: cost,
  acquiredAt: d(day),
  sourceId: "s",
});
const sale = (
  id: string,
  amount: number,
  proceeds: number,
  day: string,
): TaxableEvent => ({
  id,
  asset: "TOK",
  amount,
  proceedsUsd: proceeds,
  date: d(day),
  sourceId: "s",
});
function run(lots: TaxLot[], events: TaxableEvent[]) {
  const c = new CostBasisCalculator("UK_SHARE_POOLING");
  c.addLots(lots);
  c.registerEvents(events);
  const results = events.map((e) => c.calculate(e));
  const held = c.getLots().filter((l) => l.amount > 1e-9);
  return {
    results,
    heldAmount: held.reduce((n, l) => n + l.amount, 0),
    heldCost: held.reduce((n, l) => n + l.costBasisUsd, 0),
  };
}

describe("HMRC example 3 - application of the 30 day rule (CRYPTO22253)", () => {
  it("gains £165 and £20; pool ends at 2,200 tokens, £1,060", () => {
    const { results, heldAmount, heldCost } = run(
      [
        lot("pool", 2000, 1000, "2025-01-01"),
        lot("21Apr", 700, 175, "2025-04-21"),
        lot("28Apr", 500, 100, "2025-04-28"),
        lot("1May", 500, 150, "2025-05-01"),
      ],
      [
        sale("31Mar", 1000, 400, "2025-03-31"),
        sale("20Apr", 500, 150, "2025-04-20"),
      ],
    );
    expect(results[0].gainLoss).toBeCloseTo(165, 6);
    expect(results[1].gainLoss).toBeCloseTo(20, 6);
    expect(heldAmount).toBeCloseTo(2200, 6);
    expect(heldCost).toBeCloseTo(1060, 6);
  });
});

describe("HMRC example 4 - same day rule with the section 104 pool (CRYPTO22254)", () => {
  it("total gain £79 (£79.50 before HMRC's pence rounding); pool ends at 7,500 tokens, £937.50", () => {
    const { results, heldAmount, heldCost } = run(
      [
        lot("pool", 8000, 1000, "2025-01-01"),
        lot("a", 4000, 320, "2025-01-31"),
        lot("b", 1000, 75, "2025-01-31"),
        lot("c", 1000, 70, "2025-01-31"),
        lot("d", 500, 35, "2025-01-31"),
      ],
      [
        sale("s1", 5000, 500, "2025-01-31"),
        sale("s2", 2000, 142, "2025-01-31"),
      ],
    );
    const gain = results.reduce((n, r) => n + r.gainLoss, 0);
    expect(gain).toBeCloseTo(79.5, 6); // HMRC: 642 - 500 - 63 = 79 (63 is 62.50 rounded up)
    expect(heldAmount).toBeCloseTo(7500, 6);
    expect(heldCost).toBeCloseTo(937.5, 6);
  });
});

describe("HMRC example 5 - 30 day rule with the section 104 pool (CRYPTO22255)", () => {
  it("gain £92,500; pool ends at 10,500 tokens, £150,000", () => {
    const { results, heldAmount, heldCost } = run(
      [
        lot("pool", 14000, 200000, "2025-01-01"),
        lot("11Sep", 500, 17500, "2025-09-11"),
      ],
      [sale("30Aug", 4000, 160000, "2025-08-30")],
    );
    expect(results[0].gainLoss).toBeCloseTo(92500, 6);
    expect(heldAmount).toBeCloseTo(10500, 6);
    expect(heldCost).toBeCloseTo(150000, 6);
  });
});
