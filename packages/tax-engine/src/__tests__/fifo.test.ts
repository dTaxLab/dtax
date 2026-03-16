/**
 * FIFO Tax Calculation Unit Tests
 *
 * Tests cover:
 * 1. Basic buy-sell scenario
 * 2. Partial lot consumption
 * 3. Multiple lot matching (FIFO order)
 * 4. Short-term vs Long-term holding period
 * 5. Zero-cost basis (airdrop/fork)
 * 6. Insufficient lots warning
 * 7. Fee deduction
 * 8. Multiple assets isolation
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { calculateFIFO } from "../methods/fifo";
import type { TaxLot, TaxableEvent } from "../types";

// ─── Helper ─────────────────────────────────────────

function createLot(overrides: Partial<TaxLot> & { asset: string }): TaxLot {
  return {
    id: `lot-${Math.random().toString(36).slice(2, 8)}`,
    amount: 1.0,
    costBasisUsd: 30000,
    acquiredAt: new Date("2024-01-01"),
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
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────

describe("calculateFIFO", () => {
  // ── Test 1: Basic buy-sell ────────────────────────
  it("should calculate gain on a simple buy-sell", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2024-01-01"),
      }),
    ];

    const event = createEvent({
      id: "sale-1",
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 45000,
      date: new Date("2025-06-01"),
    });

    const result = calculateFIFO(lots, event);

    expect(result.gainLoss).toBe(15000); // 45000 - 30000
    expect(result.method).toBe("FIFO");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-1");
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
  });

  // ── Test 2: Loss scenario ────────────────────────
  it("should calculate loss when selling below cost basis", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        sourceId: "binance-1",
        amount: 5.0,
        costBasisUsd: 10000, // $2000 per ETH
        acquiredAt: new Date("2024-03-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      sourceId: "binance-1",
      amount: 5.0,
      proceedsUsd: 7500, // $1500 per ETH — a loss
      date: new Date("2024-09-01"),
    });

    const result = calculateFIFO(lots, event);

    expect(result.gainLoss).toBe(-2500); // 7500 - 10000
    expect(result.holdingPeriod).toBe("SHORT_TERM"); // < 1 year
  });

  // ── Test 3: Partial lot consumption ──────────────
  it("should handle partial lot consumption", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2024-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 0.3,
      proceedsUsd: 12000, // Selling 0.3 BTC at $40k
      date: new Date("2025-06-01"),
    });

    const result = calculateFIFO(lots, event);

    // Cost basis for 0.3 BTC = 30000 * 0.3 = 9000
    expect(result.gainLoss).toBe(3000); // 12000 - 9000
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].amountConsumed).toBe(0.3);
    expect(result.matchedLots[0].costBasisUsd).toBe(9000);
    expect(result.matchedLots[0].fullyConsumed).toBe(false);
  });

  // ── Test 4: Multiple lots — FIFO order ───────────
  it("should consume lots in FIFO order (earliest first)", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 0.5,
        costBasisUsd: 15000, // $30k per BTC
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 0.5,
        costBasisUsd: 20000, // $40k per BTC
        acquiredAt: new Date("2024-06-01"),
      }),
      createLot({
        id: "lot-3",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 50000, // $50k per BTC
        acquiredAt: new Date("2024-12-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 0.8,
      proceedsUsd: 40000, // Selling 0.8 BTC at $50k
      date: new Date("2025-06-01"),
    });

    const result = calculateFIFO(lots, event);

    // FIFO: consume lot-1 fully (0.5), then lot-2 partially (0.3)
    expect(result.matchedLots).toHaveLength(2);

    // Lot 1: fully consumed
    expect(result.matchedLots[0].lotId).toBe("lot-1");
    expect(result.matchedLots[0].amountConsumed).toBe(0.5);
    expect(result.matchedLots[0].costBasisUsd).toBe(15000);
    expect(result.matchedLots[0].fullyConsumed).toBe(true);

    // Lot 2: partially consumed (0.3 of 0.5)
    expect(result.matchedLots[1].lotId).toBe("lot-2");
    expect(result.matchedLots[1].amountConsumed).toBeCloseTo(0.3, 10);
    expect(result.matchedLots[1].costBasisUsd).toBeCloseTo(12000, 2); // 20000 * 0.3/0.5
    expect(result.matchedLots[1].fullyConsumed).toBe(false);

    // Total cost basis = 15000 + 12000 = 27000
    // Gain = 40000 - 27000 = 13000
    expect(result.gainLoss).toBeCloseTo(13000, 2);
  });

  // ── Test 5: Short-term holding ───────────────────
  it("should classify as SHORT_TERM when held less than 1 year", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2025-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 35000,
      date: new Date("2025-06-01"), // 5 months later
    });

    const result = calculateFIFO(lots, event);
    expect(result.holdingPeriod).toBe("SHORT_TERM");
  });

  // ── Test 6: Long-term holding ────────────────────
  it("should classify as LONG_TERM when held more than 1 year", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2023-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-06-01"), // 2.5 years later
    });

    const result = calculateFIFO(lots, event);
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // ── Test 7: Zero-cost basis (airdrop/fork) ───────
  it("should handle zero-cost basis lots (airdrops/forks)", () => {
    const lots = [
      createLot({
        id: "airdrop-1",
        asset: "UNI",
        amount: 400,
        costBasisUsd: 0, // Airdrop = $0 cost basis
        acquiredAt: new Date("2024-09-01"),
      }),
    ];

    const event = createEvent({
      asset: "UNI",
      amount: 400,
      proceedsUsd: 2800, // Selling at $7 per UNI
      date: new Date("2025-03-01"),
    });

    const result = calculateFIFO(lots, event);

    expect(result.gainLoss).toBe(2800); // 2800 - 0
    expect(result.matchedLots[0].costBasisUsd).toBe(0);
  });

  // ── Test 8: Insufficient lots ────────────────────
  it("should handle insufficient lots (selling more than owned)", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 0.5,
        costBasisUsd: 15000,
        acquiredAt: new Date("2024-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0, // Trying to sell 1.0 but only have 0.5
      proceedsUsd: 50000,
      date: new Date("2025-06-01"),
    });

    const result = calculateFIFO(lots, event);

    // Should still calculate what it can
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].amountConsumed).toBe(0.5);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // ── Test 9: Fee deduction ────────────────────────
  it("should deduct fees from gain/loss calculation", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        sourceId: "binance-1",
        amount: 10,
        costBasisUsd: 20000, // $2000 per ETH
        acquiredAt: new Date("2024-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      sourceId: "binance-1",
      amount: 10,
      proceedsUsd: 30000, // $3000 per ETH
      date: new Date("2025-06-01"),
      feeUsd: 50, // $50 trading fee
    });

    const result = calculateFIFO(lots, event);

    // Gain = proceeds - costBasis - fee = 30000 - 20000 - 50 = 9950
    expect(result.gainLoss).toBe(9950);
  });

  // ── Test 10: Multiple assets isolation ───────────
  it("should only match lots of the same asset", () => {
    const lots = [
      createLot({
        id: "btc-lot",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "eth-lot",
        asset: "ETH",
        sourceId: "binance-1",
        amount: 10.0,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 45000,
      date: new Date("2025-06-01"),
    });

    const result = calculateFIFO(lots, event);

    // Should only match BTC lot, not ETH
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("btc-lot");
    expect(result.gainLoss).toBe(15000);
  });

  // ── Test 11: Exact boundary — 365 days ──────────
  it("should handle exact 1-year boundary correctly", () => {
    // Exactly 366 days (accounts for leap year approximation)
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2024-01-01"), // Leap year
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-01-02"), // 367 days later
    });

    const result = calculateFIFO(lots, event);
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // ── Test 12: Exactly 1 calendar year = SHORT_TERM ─
  it("classifies exactly 1 calendar year as SHORT_TERM (IRS: more than 1 year required)", () => {
    const lots = [
      createLot({
        id: "1",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 10000,
        acquiredAt: new Date("2024-01-15"),
        sourceId: "s1",
      }),
    ];
    const event = createEvent({
      id: "s1",
      asset: "BTC",
      amount: 1,
      proceedsUsd: 15000,
      date: new Date("2025-01-15"),
      sourceId: "s1",
    });
    const result = calculateFIFO(lots, event);
    expect(result.holdingPeriod).toBe("SHORT_TERM");
  });

  // ── Test 13: 1 year + 1 day = LONG_TERM ──────────
  it("classifies 1 year + 1 day as LONG_TERM", () => {
    const lots = [
      createLot({
        id: "1",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 10000,
        acquiredAt: new Date("2024-01-15"),
        sourceId: "s1",
      }),
    ];
    const event = createEvent({
      id: "s1",
      asset: "BTC",
      amount: 1,
      proceedsUsd: 15000,
      date: new Date("2025-01-16"),
      sourceId: "s1",
    });
    const result = calculateFIFO(lots, event);
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // ── Test 14: Empty lots array ────────────────────
  it("should handle empty lots array", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-06-01"),
    });

    const result = calculateFIFO([], event);

    expect(result.matchedLots).toHaveLength(0);
    expect(result.holdingPeriod).toBe("SHORT_TERM"); // Default
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
