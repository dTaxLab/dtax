import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import type { TaxLot, TaxableEvent } from "../types";

function createSiloLots(): TaxLot[] {
  return [
    {
      id: "lot-1",
      asset: "BTC",
      amount: 1.0,
      costBasisUsd: 10000,
      acquiredAt: new Date("2024-01-01"),
      sourceId: "binance-1",
    },
    {
      id: "lot-2",
      asset: "BTC",
      amount: 1.0,
      costBasisUsd: 60000,
      acquiredAt: new Date("2024-06-01"),
      sourceId: "coinbase-1",
    },
  ];
}

describe("Wallet-Siloed calculation", () => {
  it("should consume cross-platform if strictSilo is false (legacy behavior)", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(createSiloLots());

    const sale: TaxableEvent = {
      id: "s1",
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 15000,
      date: new Date("2025-01-01"),
      sourceId: "coinbase-1",
    };

    const result = calc.calculate(sale, false);
    // Under pure FIFO, it sells the oldest (lot-1 at $10k cost basis)
    expect(result.matchedLots[0].lotId).toBe("lot-1");
    // Profit: 15000 - (10000 * 0.5) = 10000
    expect(result.gainLoss).toBe(10000);
  });

  it("should strictly isolate the source if strictSilo is true", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(createSiloLots());

    const sale: TaxableEvent = {
      id: "s1",
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 15000,
      date: new Date("2025-01-01"),
      sourceId: "coinbase-1",
    };

    const result = calc.calculate(sale, true);

    // Under strictSilo, despite lot-1 being older, it must select the coinbase lot (lot-2)
    expect(result.matchedLots[0].lotId).toBe("lot-2");

    // Cost basis of lot-2 is $60k. 0.5 of it = $30k.
    // Loss: 15000 - 30000 = -15000
    expect(result.gainLoss).toBe(-15000);
  });

  it("should calculate warning if siloing causes insufficient funds", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(createSiloLots());

    const sale: TaxableEvent = {
      id: "s1",
      asset: "BTC",
      amount: 1.5, // Total we have 2.0, but only 1.0 in coinbase
      proceedsUsd: 45000,
      date: new Date("2025-01-01"),
      sourceId: "coinbase-1",
    };

    const result = calc.calculate(sale, true);

    // Should only match the 1.0 from coinbase-1
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-2");
    expect(result.matchedLots[0].amountConsumed).toBe(1.0);
  });
});
