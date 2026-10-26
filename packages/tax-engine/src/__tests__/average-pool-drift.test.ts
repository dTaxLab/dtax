/**
 * Average-cost methods must keep the pool's average after FIFO consumption:
 * total cost 300 over two disposals of one unit each costs 150 + 150.
 *
 * @license AGPL-3.0
 */
import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import type { CostBasisMethod } from "../types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

for (const method of [
  "TOTAL_AVERAGE",
  "PMPA",
  "CA_ACB",
  "UK_SHARE_POOLING",
] as CostBasisMethod[]) {
  describe(`${method} pool average`, () => {
    it("does not drift across two successive disposals", () => {
      const c = new CostBasisCalculator(method);
      c.addLots([
        {
          id: "A",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 100,
          acquiredAt: d("2025-01-01"),
          sourceId: "s",
        },
        {
          id: "B",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 200,
          acquiredAt: d("2025-01-02"),
          sourceId: "s",
        },
      ]);
      const ev = (id: string, day: string) => ({
        id,
        asset: "BTC",
        amount: 1,
        proceedsUsd: 300,
        date: d(day),
        sourceId: "s",
      });
      const g1 = c.calculate(ev("S1", "2025-03-01")).gainLoss;
      const g2 = c.calculate(ev("S2", "2025-04-01")).gainLoss;
      expect(g1 + g2).toBe(300);
    });
  });
}
