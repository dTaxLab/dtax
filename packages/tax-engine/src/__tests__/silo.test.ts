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

// ─── LIFO + HIFO with strict silo ────────────────

describe("Wallet-Siloed LIFO", () => {
  it("selects newest lot within silo under LIFO", () => {
    const calc = new CostBasisCalculator("LIFO");
    calc.addLots([
      {
        id: "lot-cb-old",
        asset: "ETH",
        amount: 5,
        costBasisUsd: 10000,
        acquiredAt: new Date("2023-01-01"),
        sourceId: "coinbase",
      },
      {
        id: "lot-cb-new",
        asset: "ETH",
        amount: 5,
        costBasisUsd: 15000,
        acquiredAt: new Date("2024-06-01"),
        sourceId: "coinbase",
      },
      {
        id: "lot-binance",
        asset: "ETH",
        amount: 5,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-12-01"),
        sourceId: "binance",
      },
    ]);

    const sale: TaxableEvent = {
      id: "s1",
      asset: "ETH",
      amount: 3,
      proceedsUsd: 9000,
      date: new Date("2025-01-15"),
      sourceId: "coinbase",
    };

    const result = calc.calculate(sale, true);
    // LIFO within coinbase silo → newest coinbase lot (lot-cb-new)
    expect(result.matchedLots[0].lotId).toBe("lot-cb-new");
    // 3/5 * 15000 = 9000 basis, proceeds 9000 → gain 0
    expect(result.gainLoss).toBeCloseTo(0, 0);
  });
});

describe("Wallet-Siloed HIFO", () => {
  it("selects highest-cost lot within silo under HIFO", () => {
    const calc = new CostBasisCalculator("HIFO");
    calc.addLots([
      {
        id: "lot-cb-low",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 20000,
        acquiredAt: new Date("2023-01-01"),
        sourceId: "coinbase",
      },
      {
        id: "lot-cb-high",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 60000,
        acquiredAt: new Date("2024-03-01"),
        sourceId: "coinbase",
      },
      {
        id: "lot-kraken-highest",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 70000,
        acquiredAt: new Date("2024-06-01"),
        sourceId: "kraken",
      },
    ]);

    const sale: TaxableEvent = {
      id: "s1",
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 25000,
      date: new Date("2025-01-15"),
      sourceId: "coinbase",
    };

    const result = calc.calculate(sale, true);
    // HIFO within coinbase silo → highest cost lot (lot-cb-high at $60k)
    expect(result.matchedLots[0].lotId).toBe("lot-cb-high");
    // 0.5 * 60000 = 30000 basis, proceeds 25000 → loss -5000
    expect(result.gainLoss).toBeCloseTo(-5000, 0);
  });
});

// ─── Multi-wallet scenarios ──────────────────────

describe("Wallet-Siloed multi-wallet", () => {
  it("sells from 3 different wallets independently", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      {
        id: "lot-a",
        asset: "SOL",
        amount: 100,
        costBasisUsd: 1000,
        acquiredAt: new Date("2024-01-01"),
        sourceId: "wallet-a",
      },
      {
        id: "lot-b",
        asset: "SOL",
        amount: 100,
        costBasisUsd: 5000,
        acquiredAt: new Date("2024-03-01"),
        sourceId: "wallet-b",
      },
      {
        id: "lot-c",
        asset: "SOL",
        amount: 100,
        costBasisUsd: 10000,
        acquiredAt: new Date("2024-06-01"),
        sourceId: "wallet-c",
      },
    ]);

    // Sell from wallet-b
    const saleB: TaxableEvent = {
      id: "s-b",
      asset: "SOL",
      amount: 50,
      proceedsUsd: 3000,
      date: new Date("2025-01-15"),
      sourceId: "wallet-b",
    };
    const resultB = calc.calculate(saleB, true);
    expect(resultB.matchedLots[0].lotId).toBe("lot-b");
    // 50/100 * 5000 = 2500 basis, proceeds 3000 → gain 500
    expect(resultB.gainLoss).toBeCloseTo(500, 0);

    // Sell from wallet-a — lot-a is still full
    const saleA: TaxableEvent = {
      id: "s-a",
      asset: "SOL",
      amount: 100,
      proceedsUsd: 8000,
      date: new Date("2025-02-01"),
      sourceId: "wallet-a",
    };
    const resultA = calc.calculate(saleA, true);
    expect(resultA.matchedLots[0].lotId).toBe("lot-a");
    // 100/100 * 1000 = 1000 basis, proceeds 8000 → gain 7000
    expect(resultA.gainLoss).toBeCloseTo(7000, 0);
  });

  it("different asset in same wallet does not cross-contaminate", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      {
        id: "lot-btc",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 50000,
        acquiredAt: new Date("2024-01-01"),
        sourceId: "coinbase",
      },
      {
        id: "lot-eth",
        asset: "ETH",
        amount: 10,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-01-01"),
        sourceId: "coinbase",
      },
    ]);

    const sale: TaxableEvent = {
      id: "s-eth",
      asset: "ETH",
      amount: 5,
      proceedsUsd: 15000,
      date: new Date("2025-01-15"),
      sourceId: "coinbase",
    };

    const result = calc.calculate(sale, true);
    expect(result.matchedLots[0].lotId).toBe("lot-eth");
    // 5/10 * 20000 = 10000 basis, proceeds 15000 → gain 5000
    expect(result.gainLoss).toBeCloseTo(5000, 0);
  });
});
