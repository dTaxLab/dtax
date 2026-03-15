/**
 * Total Average (総平均法) Unit Tests
 *
 * Tests cover:
 * 1. Basic weighted average calculation
 * 2. Multiple lots at different prices
 * 3. Sequential sales
 * 4. Empty lots edge case
 * 5. StrictSilo mode
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { calculateTotalAverage } from "../methods/total-average";
import type { TaxLot, TaxableEvent } from "../types";

// ─── Helpers ────────────────────────────────────────

function createLot(overrides: Partial<TaxLot> & { asset: string }): TaxLot {
  return {
    id: `lot-${Math.random().toString(36).slice(2, 8)}`,
    amount: 1.0,
    costBasisUsd: 30000,
    acquiredAt: new Date("2024-01-01"),
    sourceId: "exchange-1",
    ...overrides,
  };
}

function createEvent(
  overrides: Partial<TaxableEvent> & { asset: string },
): TaxableEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2, 8)}`,
    amount: 1.0,
    proceedsUsd: 40000,
    date: new Date("2025-06-01"),
    sourceId: "exchange-1",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────

describe("calculateTotalAverage", () => {
  // ── Test 1: Basic weighted average ────────────────
  it("should calculate gain using weighted average cost", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
    });

    const result = calculateTotalAverage(lots, event);

    expect(result.gainLoss).toBe(15000); // 45000 - 30000
    expect(result.method).toBe("TOTAL_AVERAGE");
    expect(result.matchedLots).toHaveLength(1);
  });

  // ── Test 2: Multiple lots, verify average cost ────
  it("should average cost across multiple lots at different prices", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        amount: 3.0,
        costBasisUsd: 6000, // $2000/ETH
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "ETH",
        amount: 2.0,
        costBasisUsd: 8000, // $4000/ETH
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      amount: 2.0,
      proceedsUsd: 8000, // $4000/ETH
    });

    const result = calculateTotalAverage(lots, event);

    // Avg cost = (6000 + 8000) / 5 = $2800/ETH
    // Cost basis for 2 ETH = 2800 * 2 = 5600
    // Gain = 8000 - 5600 = 2400
    expect(result.gainLoss).toBe(2400);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].costBasisUsd).toBeCloseTo(5600, 2);
  });

  // ── Test 3: Sequential sales ──────────────────────
  it("should recalculate average after lots are consumed", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 10000, // $10k/BTC
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000, // $30k/BTC
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    // First sale
    const event1 = createEvent({
      id: "sale-1",
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 25000,
    });

    const result1 = calculateTotalAverage(lots, event1);
    // Avg = (10k + 30k) / 2 = 20k
    expect(result1.gainLoss).toBe(5000); // 25000 - 20000

    // After first sale, lot-1 is consumed, lot-2 has 1.0 BTC at $30k
    const event2 = createEvent({
      id: "sale-2",
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 35000,
    });

    const result2 = calculateTotalAverage(lots, event2);
    // Only lot-2 left: avg = 30000 / 1 = 30k
    expect(result2.gainLoss).toBe(5000); // 35000 - 30000
  });

  // ── Test 4: Empty lots edge case ──────────────────
  it("should handle empty lots array", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
    });

    const result = calculateTotalAverage([], event);

    expect(result.matchedLots).toHaveLength(0);
    expect(result.holdingPeriod).toBe("SHORT_TERM");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // ── Test 5: StrictSilo mode ───────────────────────
  it("should only match lots from same source in strictSilo mode", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 20000,
        sourceId: "binance",
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 40000,
        sourceId: "kraken",
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      sourceId: "binance",
    });

    const result = calculateTotalAverage(lots, event, true);

    // Should only use lot-1 (binance), avg = 20000
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-1");
    expect(result.gainLoss).toBe(30000); // 50000 - 20000
  });

  // ── Test 6: Fee handling ──────────────────────────
  it("should deduct fees from gain calculation", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
      feeUsd: 200,
    });

    const result = calculateTotalAverage(lots, event);

    // 45000 - 30000 - 200 = 14800
    expect(result.gainLoss).toBe(14800);
  });

  // ── Test 7: Holding period based on earliest lot ──
  it("should determine holding period from earliest consumed lot", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 10000,
        acquiredAt: new Date("2023-01-01"), // > 1 year
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 20000,
        acquiredAt: new Date("2025-03-01"), // < 1 year
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 25000,
      date: new Date("2025-06-01"),
    });

    const result = calculateTotalAverage(lots, event);

    // FIFO: lot-1 consumed first → long-term
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });
});
