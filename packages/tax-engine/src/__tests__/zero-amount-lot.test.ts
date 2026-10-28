/**
 * A conversion that received nothing (an exchange's dust conversion whose
 * service charge ate the whole amount) is stored as a TRADE that received 0:
 * the asset sent left the account, so it must be a disposal. Its lot is of
 * amount 0. These tests pin what that relies on in the engine.
 */
import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../index";
import type { CostBasisMethod, TaxLot, TaxableEvent } from "../index";

const d = (s: string) => new Date(s);
const lot = (id: string, amount: number, cost: number, at: string): TaxLot => ({
  id,
  asset: "BNB",
  amount,
  costBasisUsd: cost,
  acquiredAt: d(at),
  sourceId: "s",
});
const sell = (
  asset: string,
  amount: number,
  proceeds: number,
): TaxableEvent => ({
  id: "e",
  asset,
  amount,
  proceedsUsd: proceeds,
  date: d("2024-06-01"),
  feeUsd: 0,
  sourceId: "s",
});

describe("a lot of amount 0 does not disturb the cost basis calculation", () => {
  for (const method of ["FIFO", "LIFO", "HIFO"] as CostBasisMethod[]) {
    it(`${method}: zero-amount lots before and after a real one are skipped; the gain is right and finite`, () => {
      const calc = new CostBasisCalculator(method);
      calc.addLots([
        lot("z1", 0, 0, "2024-01-01"),
        lot("real", 2, 200, "2024-01-02"),
        lot("z2", 0, 0, "2024-01-03"),
      ]);
      const r = calc.calculate(sell("BNB", 1, 150));
      expect(Number.isFinite(r.gainLoss)).toBe(true);
      expect(r.gainLoss).toBeCloseTo(50, 8); // 150 - 100
      expect(r.unmatchedAmount ?? 0).toBe(0);
      expect(r.matchedLots.every((l) => Number.isFinite(l.costBasisUsd))).toBe(
        true,
      );
    });
  }

  it("a disposal with no proceeds is a loss equal to its cost", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([{ ...lot("a", 3, 30, "2024-01-01"), asset: "ADA" }]);
    const r = calc.calculate(sell("ADA", 3, 0));
    expect(r.gainLoss).toBeCloseTo(-30, 8);
  });
});
