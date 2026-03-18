/**
 * UK Share Pooling (HMRC Section 104 Pool) Unit Tests
 *
 * Tests cover:
 * 1. Single lot — pool cost = lot cost
 * 2. Multiple lots — weighted average pool cost
 * 3. Partial sale — proportional pool cost
 * 4. Multiple sequential sales
 * 5. No matching lots → zero result
 * 6. Fee handling
 * 7. Strict silo mode
 * 8. Long-term holding period
 * 9. Short-term holding period
 * 10. Mixed assets — only pool matching asset
 * 11. Precision with small amounts
 * 12. Full liquidation
 * 13. Loss scenario
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { calculateUKSharePooling } from "../methods/uk-share-pooling";
import type { TaxLot, TaxableEvent } from "../types";

// ─── Helpers ────────────────────────────────────────

function makeLot(overrides: Partial<TaxLot> = {}): TaxLot {
  return {
    id: "lot-1",
    asset: "BTC",
    amount: 1,
    costBasisUsd: 10000,
    acquiredAt: new Date("2024-01-01"),
    sourceId: "exchange-1",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<TaxableEvent> = {}): TaxableEvent {
  return {
    id: "evt-1",
    asset: "BTC",
    amount: 1,
    proceedsUsd: 15000,
    date: new Date("2024-06-01"),
    sourceId: "exchange-1",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────

describe("UK Share Pooling (Section 104)", () => {
  // 1. Single lot — pool cost = lot cost
  it("single lot gives exact cost basis", () => {
    const lots = [makeLot({ id: "lot-1", amount: 1, costBasisUsd: 10000 })];
    const event = makeEvent({ amount: 1, proceedsUsd: 15000 });

    const result = calculateUKSharePooling(lots, event);

    expect(result.gainLoss).toBe(5000); // 15000 - 10000
    expect(result.method).toBe("UK_SHARE_POOLING");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
    expect(result.matchedLots[0].costBasisUsd).toBe(10000);
  });

  // 2. Multiple lots — weighted average pool cost
  it("pools multiple lots into weighted average", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 1,
        costBasisUsd: 10000,
        acquiredAt: new Date("2024-01-01"),
      }),
      makeLot({
        id: "lot-2",
        amount: 1,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-03-01"),
      }),
    ];
    const event = makeEvent({ amount: 1, proceedsUsd: 18000 });

    const result = calculateUKSharePooling(lots, event);

    // Pool avg = (10000 + 20000) / 2 = 15000/BTC
    // Gain = 18000 - 15000 = 3000
    expect(result.gainLoss).toBe(3000);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].costBasisUsd).toBe(15000);
  });

  // 3. Partial sale — proportional pool cost
  it("handles partial sale with proportional cost", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        asset: "ETH",
        amount: 5,
        costBasisUsd: 10000,
        acquiredAt: new Date("2024-01-01"),
      }),
      makeLot({
        id: "lot-2",
        asset: "ETH",
        amount: 5,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-06-01"),
      }),
    ];
    const event = makeEvent({ asset: "ETH", amount: 3, proceedsUsd: 12000 });

    const result = calculateUKSharePooling(lots, event);

    // Pool avg = (10000 + 20000) / 10 = 3000/ETH
    // Cost = 3000 * 3 = 9000
    // Gain = 12000 - 9000 = 3000
    expect(result.gainLoss).toBe(3000);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].amountConsumed).toBe(3);
    expect(result.matchedLots[0].costBasisUsd).toBe(9000);
    expect(result.matchedLots[0].fullyConsumed).toBe(false);
  });

  // 4. Multiple sequential sales
  it("correctly updates pool after multiple sales", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 1,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-01-01"),
      }),
      makeLot({
        id: "lot-2",
        amount: 1,
        costBasisUsd: 40000,
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    // First sale: sell 1 BTC
    const event1 = makeEvent({ id: "evt-1", amount: 1, proceedsUsd: 50000 });
    const result1 = calculateUKSharePooling(lots, event1);

    // Pool avg = (20000 + 40000) / 2 = 30000
    // Gain = 50000 - 30000 = 20000
    expect(result1.gainLoss).toBe(20000);

    // Second sale: sell remaining 1 BTC (lot-1 consumed, lot-2 remaining)
    const event2 = makeEvent({ id: "evt-2", amount: 1, proceedsUsd: 50000 });
    const result2 = calculateUKSharePooling(lots, event2);

    // Only lot-2 remains: avg = 40000/1 = 40000
    // Gain = 50000 - 40000 = 10000
    expect(result2.gainLoss).toBe(10000);
  });

  // 5. No matching lots → zero result
  it("returns zero when no lots match asset", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const lots = [makeLot({ asset: "ETH", amount: 1, costBasisUsd: 5000 })];
    const event = makeEvent({ asset: "BTC", amount: 1, proceedsUsd: 15000 });

    const result = calculateUKSharePooling(lots, event);

    expect(result.matchedLots).toHaveLength(0);
    expect(result.gainLoss).toBe(15000); // proceeds - 0 cost
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // 6. Fee handling
  it("deducts fees from gain", () => {
    const lots = [makeLot({ amount: 1, costBasisUsd: 10000 })];
    const event = makeEvent({ amount: 1, proceedsUsd: 15000, feeUsd: 200 });

    const result = calculateUKSharePooling(lots, event);

    // 15000 - 10000 - 200 = 4800
    expect(result.gainLoss).toBe(4800);
  });

  // 7. Strict silo mode
  it("respects strictSilo flag", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 1,
        costBasisUsd: 10000,
        sourceId: "binance",
      }),
      makeLot({
        id: "lot-2",
        amount: 1,
        costBasisUsd: 30000,
        sourceId: "kraken",
      }),
    ];
    const event = makeEvent({
      amount: 1,
      proceedsUsd: 40000,
      sourceId: "kraken",
    });

    const result = calculateUKSharePooling(lots, event, true);

    // Only kraken lot-2: avg = 30000/1 = 30000
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-2");
    expect(result.gainLoss).toBe(10000); // 40000 - 30000
  });

  // 8. Long-term holding period
  it("classifies long-term when earliest lot > 1 year", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 1,
        costBasisUsd: 10000,
        acquiredAt: new Date("2023-01-01"), // > 1 year before event
      }),
    ];
    const event = makeEvent({
      amount: 1,
      proceedsUsd: 15000,
      date: new Date("2025-06-01"),
    });

    const result = calculateUKSharePooling(lots, event);

    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // 9. Short-term holding period
  it("classifies short-term when lots < 1 year", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 1,
        costBasisUsd: 10000,
        acquiredAt: new Date("2024-03-01"),
      }),
    ];
    const event = makeEvent({
      amount: 1,
      proceedsUsd: 15000,
      date: new Date("2024-06-01"),
    });

    const result = calculateUKSharePooling(lots, event);

    expect(result.holdingPeriod).toBe("SHORT_TERM");
  });

  // 10. Mixed assets — only pool matching asset
  it("only pools lots of the same asset", () => {
    const lots = [
      makeLot({
        id: "lot-btc",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 10000,
      }),
      makeLot({
        id: "lot-eth",
        asset: "ETH",
        amount: 10,
        costBasisUsd: 50000,
      }),
      makeLot({
        id: "lot-btc2",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-03-01"),
      }),
    ];
    const event = makeEvent({ asset: "BTC", amount: 1, proceedsUsd: 18000 });

    const result = calculateUKSharePooling(lots, event);

    // Pool for BTC only: (10000 + 20000) / 2 = 15000/BTC
    // Gain = 18000 - 15000 = 3000
    expect(result.gainLoss).toBe(3000);
    // ETH lot should not be touched
    expect(lots.find((l) => l.id === "lot-eth")!.amount).toBe(10);
  });

  // 11. Precision with small amounts
  it("handles small remainder amounts correctly", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 0.00001,
        costBasisUsd: 0.5,
        acquiredAt: new Date("2024-01-01"),
      }),
      makeLot({
        id: "lot-2",
        amount: 0.00002,
        costBasisUsd: 1.2,
        acquiredAt: new Date("2024-02-01"),
      }),
    ];
    const event = makeEvent({ amount: 0.00001, proceedsUsd: 0.8 });

    const result = calculateUKSharePooling(lots, event);

    // Pool avg = (0.5 + 1.2) / 0.00003 = 56666.666.../unit
    // Cost = 56666.666... * 0.00001 ≈ 0.56666...
    // Gain ≈ 0.8 - 0.56666... ≈ 0.23333...
    expect(result.gainLoss).toBeCloseTo(0.23333, 4);
    expect(result.matchedLots).toHaveLength(1);
  });

  // 12. Full liquidation
  it("handles full liquidation of all lots", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 2,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-01-01"),
      }),
      makeLot({
        id: "lot-2",
        amount: 3,
        costBasisUsd: 45000,
        acquiredAt: new Date("2024-03-01"),
      }),
    ];
    const event = makeEvent({ amount: 5, proceedsUsd: 80000 });

    const result = calculateUKSharePooling(lots, event);

    // Pool avg = (20000 + 45000) / 5 = 13000/BTC
    // Cost = 13000 * 5 = 65000
    // Gain = 80000 - 65000 = 15000
    expect(result.gainLoss).toBe(15000);
    expect(result.matchedLots).toHaveLength(2);
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
    expect(result.matchedLots[1].fullyConsumed).toBe(true);

    // All lots should be depleted
    expect(lots[0].amount).toBeCloseTo(0, 8);
    expect(lots[1].amount).toBeCloseTo(0, 8);
  });

  // 13. Loss scenario
  it("correctly calculates losses", () => {
    const lots = [
      makeLot({
        id: "lot-1",
        amount: 2,
        costBasisUsd: 8000,
        asset: "ETH",
        acquiredAt: new Date("2024-01-01"),
      }),
      makeLot({
        id: "lot-2",
        amount: 2,
        costBasisUsd: 12000,
        asset: "ETH",
        acquiredAt: new Date("2024-06-01"),
      }),
    ];
    const event = makeEvent({
      asset: "ETH",
      amount: 2,
      proceedsUsd: 6000,
    });

    const result = calculateUKSharePooling(lots, event);

    // Pool avg = (8000 + 12000) / 4 = 5000/ETH
    // Cost = 5000 * 2 = 10000
    // Loss = 6000 - 10000 = -4000
    expect(result.gainLoss).toBe(-4000);
  });
});
