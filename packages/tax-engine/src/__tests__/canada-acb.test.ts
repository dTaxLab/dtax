/**
 * Canada ACB (Adjusted Cost Base) Unit Tests — CRA IT-387R2
 *
 * Tests cover:
 * 1. Single lot — ACB equals individual cost
 * 2. Multiple lots at different prices → weighted average ACB
 * 3. Partial sale — ACB/unit derived from weighted average
 * 4. Sequential sales — ACB recalculates after each sale
 * 5. Loss scenario + superficial loss warning emitted
 * 6. Fee handling
 * 7. StrictSilo mode
 * 8. Holding period classification
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { calculateCanadaACB } from "../methods/canada-acb";
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

describe("calculateCanadaACB", () => {
  // ── Test 1: Single lot — ACB = individual cost ────
  it("should equal individual lot cost with a single lot", () => {
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

    const result = calculateCanadaACB(lots, event);

    expect(result.gainLoss).toBe(15000); // 45000 - 30000
    expect(result.method).toBe("CA_ACB");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
  });

  // ── Test 2: Multiple lots → weighted average ACB ──
  it("should use weighted average ACB across multiple lots", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 20000, // $20k/BTC
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 40000, // $40k/BTC
      }),
    ];

    // ACB/unit = (20000 + 40000) / (1 + 1) = $30k
    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 35000,
    });

    const result = calculateCanadaACB(lots, event);

    // Gain = 35000 - 30000 = 5000
    expect(result.gainLoss).toBe(5000);
    expect(result.method).toBe("CA_ACB");
    // Engine returns full gain; UI notes 50% inclusion rate
    expect(result.matchedLots).toHaveLength(1);
  });

  // ── Test 3: Partial sale ───────────────────────────
  it("should apply ACB/unit correctly on partial sale", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 2.0,
        costBasisUsd: 60000, // $30k/BTC
      }),
    ];

    // Sell only 1 BTC; ACB/unit = 60000/2 = 30000
    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 40000,
    });

    const result = calculateCanadaACB(lots, event);

    // Consumed cost = 30000 × 1.0 = 30000; gain = 40000 - 30000 = 10000
    expect(result.gainLoss).toBe(10000);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].amountConsumed).toBe(1.0);
    expect(result.matchedLots[0].fullyConsumed).toBe(false);
  });

  // ── Test 4: Sequential sales — ACB recalculates ───
  it("should recalculate ACB correctly after partial sale", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        amount: 3.0,
        costBasisUsd: 6000, // $2000/ETH
      }),
    ];

    // First sale: 1 ETH at $2500
    const event1 = createEvent({
      asset: "ETH",
      amount: 1.0,
      proceedsUsd: 2500,
    });
    const result1 = calculateCanadaACB(lots, event1);
    // ACB/unit = 6000/3 = 2000; gain = 2500 - 2000 = 500
    expect(result1.gainLoss).toBe(500);

    // After first sale: 2 ETH remaining, costBasis should reflect actual remaining
    // Second sale: 1 ETH at $3000
    const event2 = createEvent({
      asset: "ETH",
      amount: 1.0,
      proceedsUsd: 3000,
    });
    const result2 = calculateCanadaACB(lots, event2);
    // ACB/unit for remaining = 4000/2 = 2000 (same per-unit); gain = 3000 - 2000 = 1000
    expect(result2.gainLoss).toBe(1000);
  });

  // ── Test 5: Loss + superficial loss warning ────────
  it("should emit superficial loss warning on loss", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 50000,
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 40000, // loss of 10000
    });

    const result = calculateCanadaACB(lots, event);

    expect(result.gainLoss).toBe(-10000); // 40000 - 50000
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Superficial loss candidate"),
    );

    warnSpy.mockRestore();
  });

  // ── Test 6: Fee handling ───────────────────────────
  it("should deduct fees from gain", () => {
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
      feeUsd: 150,
    });

    const result = calculateCanadaACB(lots, event);

    // 45000 - 30000 - 150 = 14850
    expect(result.gainLoss).toBe(14850);
  });

  // ── Test 7: StrictSilo mode ───────────────────────
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
      proceedsUsd: 45000,
      sourceId: "kraken",
    });

    const result = calculateCanadaACB(lots, event, true);

    // Only lot-2 (kraken) is in scope; ACB/unit = 40000/1 = 40000
    // Gain = 45000 - 40000 = 5000
    expect(result.gainLoss).toBe(5000);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-2");
  });

  // ── Test 8: Holding period classification ──────────
  it("should classify holding period based on earliest consumed lot", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2023-01-01"), // > 1 year
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-06-01"),
    });

    const result = calculateCanadaACB(lots, event);
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // ── Test 9: Three lots, sell all — weighted ACB ───
  it("should correctly compute weighted average from three lots at different prices", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "ETH", amount: 2.0, costBasisUsd: 4000 }), // $2000/ETH
      createLot({ id: "lot-2", asset: "ETH", amount: 3.0, costBasisUsd: 9000 }), // $3000/ETH
      createLot({ id: "lot-3", asset: "ETH", amount: 5.0, costBasisUsd: 20000 }), // $4000/ETH
    ];

    // Total: 10 ETH, $33000 → ACB/unit = $3300/ETH
    const event = createEvent({
      asset: "ETH",
      amount: 10.0,
      proceedsUsd: 40000, // $4000/ETH
    });

    const result = calculateCanadaACB(lots, event);

    // Gain = 40000 - (3300 × 10) = 40000 - 33000 = 7000
    expect(result.gainLoss).toBe(7000);
    expect(result.matchedLots).toHaveLength(3);
  });
});
