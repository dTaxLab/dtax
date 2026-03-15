/**
 * PMPA (Prix Moyen Pondéré d'Acquisition) Unit Tests
 *
 * Tests cover:
 * 1. Single lot, single sale (avg = individual cost)
 * 2. Multiple lots at different prices → weighted average cost
 * 3. Partial sale (verify avg cost is used)
 * 4. Sequential sales (avg cost recalculates after first sale)
 * 5. Loss scenario
 * 6. Fee handling
 * 7. Holding period (based on earliest consumed lot)
 * 8. StrictSilo mode
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { calculatePMPA } from "../methods/pmpa";
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

describe("calculatePMPA", () => {
  // ── Test 1: Single lot (avg = individual cost) ────
  it("should equal individual cost with a single lot", () => {
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

    const result = calculatePMPA(lots, event);

    expect(result.gainLoss).toBe(15000); // 45000 - 30000
    expect(result.method).toBe("PMPA");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
  });

  // ── Test 2: Multiple lots → weighted average ─────
  it("should use weighted average cost across multiple lots", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 20000, // $20k/BTC
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 40000, // $40k/BTC
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
    });

    const result = calculatePMPA(lots, event);

    // Avg cost = (20000 + 40000) / 2 = $30000/BTC
    // Gain = 50000 - 30000 = 20000
    expect(result.gainLoss).toBe(20000);
    expect(result.matchedLots).toHaveLength(1);
    // Cost basis in matched lot uses avg cost
    expect(result.matchedLots[0].costBasisUsd).toBe(30000);
  });

  // ── Test 3: Partial sale with weighted average ────
  it("should use weighted average for partial sales", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        amount: 5.0,
        costBasisUsd: 10000, // $2000/ETH
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "ETH",
        amount: 5.0,
        costBasisUsd: 20000, // $4000/ETH
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      amount: 3.0,
      proceedsUsd: 12000, // $4000/ETH
    });

    const result = calculatePMPA(lots, event);

    // Avg cost = (10000 + 20000) / 10 = $3000/ETH
    // Cost basis for 3 ETH = 3000 * 3 = 9000
    // Gain = 12000 - 9000 = 3000
    expect(result.gainLoss).toBe(3000);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].amountConsumed).toBe(3.0);
    expect(result.matchedLots[0].costBasisUsd).toBe(9000);
    expect(result.matchedLots[0].fullyConsumed).toBe(false);
  });

  // ── Test 4: Sequential sales ──────────────────────
  it("should recalculate average cost after first sale consumes lots", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 20000, // $20k/BTC
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 40000, // $40k/BTC
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    // First sale: sell 1 BTC
    const event1 = createEvent({
      id: "sale-1",
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
    });

    const result1 = calculatePMPA(lots, event1);
    // Avg cost = (20k + 40k) / 2 = 30k
    expect(result1.gainLoss).toBe(20000); // 50000 - 30000

    // After first sale, lot-1 is fully consumed (amount=0)
    // lot-2 still has 1.0 BTC with costBasis = 40000

    // Second sale: sell remaining 1 BTC
    const event2 = createEvent({
      id: "sale-2",
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
    });

    const result2 = calculatePMPA(lots, event2);
    // Now only lot-2 remains: avg cost = 40000 / 1.0 = 40k
    expect(result2.gainLoss).toBe(10000); // 50000 - 40000
  });

  // ── Test 5: Loss scenario ─────────────────────────
  it("should calculate loss when proceeds < weighted avg cost", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        amount: 2.0,
        costBasisUsd: 8000, // $4000/ETH
        acquiredAt: new Date("2024-06-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "ETH",
        amount: 2.0,
        costBasisUsd: 12000, // $6000/ETH
        acquiredAt: new Date("2024-09-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      amount: 2.0,
      proceedsUsd: 6000, // $3000/ETH — a loss
    });

    const result = calculatePMPA(lots, event);

    // Avg cost = (8000 + 12000) / 4 = $5000/ETH
    // Cost = 5000 * 2 = 10000
    // Loss = 6000 - 10000 = -4000
    expect(result.gainLoss).toBe(-4000);
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
      feeUsd: 100,
    });

    const result = calculatePMPA(lots, event);

    // 45000 - 30000 - 100 = 14900
    expect(result.gainLoss).toBe(14900);
  });

  // ── Test 7: Holding period ────────────────────────
  it("should determine holding period from earliest consumed lot", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 15000,
        acquiredAt: new Date("2023-01-01"), // > 1 year ago
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 20000,
        acquiredAt: new Date("2025-03-01"), // < 1 year ago
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 25000,
      date: new Date("2025-06-01"),
    });

    const result = calculatePMPA(lots, event);

    // FIFO order: lot-1 is consumed first → long-term
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // ── Test 8: StrictSilo mode ───────────────────────
  it("should only match lots from same source in strictSilo mode", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 20000,
        sourceId: "binance",
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 40000,
        sourceId: "kraken",
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      sourceId: "kraken",
    });

    const result = calculatePMPA(lots, event, true);

    // Should only use lot-2 (kraken), avg = 40000/1 = 40000
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-2");
    expect(result.gainLoss).toBe(10000); // 50000 - 40000
  });

  // ── Test 9: Empty lots ────────────────────────────
  it("should handle empty lots array", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
    });

    const result = calculatePMPA([], event);

    expect(result.matchedLots).toHaveLength(0);
    expect(result.gainLoss).toBe(50000); // proceeds - 0 cost
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
