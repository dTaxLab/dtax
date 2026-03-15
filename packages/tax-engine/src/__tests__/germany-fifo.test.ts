/**
 * Germany FIFO with 12-Month Tax Exemption Unit Tests
 *
 * Tests cover:
 * 1. Basic sale within 12 months (normal gain)
 * 2. Sale after 12 months (tax-free, zero gain)
 * 3. Mixed holding periods (partial exemption)
 * 4. Loss within 12 months (loss recognized)
 * 5. Loss after 12 months (loss = 0, not deductible)
 * 6. Multiple lot consumption with mixed periods
 * 7. Fee handling with exempt gains
 * 8. StrictSilo mode
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { calculateGermanyFIFO } from "../methods/germany-fifo";
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

describe("calculateGermanyFIFO", () => {
  // ── Test 1: Basic sale within 12 months ───────────
  it("should calculate normal gain when held less than 12 months", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2025-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
      date: new Date("2025-06-01"), // 5 months later
    });

    const result = calculateGermanyFIFO(lots, event);

    expect(result.gainLoss).toBe(15000); // 45000 - 30000
    expect(result.method).toBe("GERMANY_FIFO");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
  });

  // ── Test 2: Sale after 12 months (tax-free) ──────
  it("should have zero gain when held more than 12 months", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2023-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 60000,
      date: new Date("2025-06-01"), // > 2 years
    });

    const result = calculateGermanyFIFO(lots, event);

    // Gain is zero because lot is exempt (held > 12 months)
    expect(result.gainLoss).toBe(0);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-1");
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
  });

  // ── Test 3: Mixed holding periods ─────────────────
  it("should apply partial exemption for mixed holding periods", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 15000, // $30k/BTC, acquired > 12 months ago
        acquiredAt: new Date("2023-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 20000, // $40k/BTC, acquired < 12 months ago
        acquiredAt: new Date("2025-03-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000, // $50k/BTC
      date: new Date("2025-06-01"),
    });

    const result = calculateGermanyFIFO(lots, event);

    // lot-1 (0.5 BTC) is exempt: proceeds portion = 25000, cost = 15000, gain = 0 (exempt)
    // lot-2 (0.5 BTC) is taxable: proceeds portion = 25000, cost = 20000, gain = 5000
    expect(result.gainLoss).toBe(5000);
    expect(result.matchedLots).toHaveLength(2);
  });

  // ── Test 4: Loss within 12 months ─────────────────
  it("should recognize loss when held less than 12 months", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        amount: 5.0,
        costBasisUsd: 10000, // $2000/ETH
        acquiredAt: new Date("2025-03-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      amount: 5.0,
      proceedsUsd: 7500, // $1500/ETH — a loss
      date: new Date("2025-06-01"), // 3 months
    });

    const result = calculateGermanyFIFO(lots, event);

    expect(result.gainLoss).toBe(-2500); // 7500 - 10000
  });

  // ── Test 5: Loss after 12 months (not deductible) ─
  it("should have zero loss when held more than 12 months (not deductible)", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        amount: 5.0,
        costBasisUsd: 10000, // $2000/ETH
        acquiredAt: new Date("2023-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      amount: 5.0,
      proceedsUsd: 7500, // Selling at a loss
      date: new Date("2025-06-01"), // > 2 years
    });

    const result = calculateGermanyFIFO(lots, event);

    // Loss is also zeroed out for exempt lots
    expect(result.gainLoss).toBe(0);
  });

  // ── Test 6: Multiple lots with mixed periods ──────
  it("should handle multiple lot consumption with mixed holding periods", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 0.3,
        costBasisUsd: 9000, // $30k/BTC, old (exempt)
        acquiredAt: new Date("2023-06-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 0.4,
        costBasisUsd: 16000, // $40k/BTC, old (exempt)
        acquiredAt: new Date("2023-12-01"),
      }),
      createLot({
        id: "lot-3",
        asset: "BTC",
        amount: 0.3,
        costBasisUsd: 15000, // $50k/BTC, recent (taxable)
        acquiredAt: new Date("2025-04-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 60000, // $60k/BTC
      date: new Date("2025-06-01"),
    });

    const result = calculateGermanyFIFO(lots, event);

    // lot-1 (0.3): exempt, lot-2 (0.4): exempt, lot-3 (0.3): taxable
    // Taxable proceeds = (0.3/1.0) * 60000 = 18000
    // Taxable cost = 15000
    // Gain = 18000 - 15000 = 3000
    expect(result.gainLoss).toBe(3000);
    expect(result.matchedLots).toHaveLength(3);
  });

  // ── Test 7: Fee handling with exempt gains ────────
  it("should deduct fees even when gains are partially exempt", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2023-01-01"), // exempt
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-06-01"),
      feeUsd: 100,
    });

    const result = calculateGermanyFIFO(lots, event);

    // Gain from lot is exempt (0), minus fee = -100
    expect(result.gainLoss).toBe(-100);
  });

  it("should deduct fees from taxable gains normally", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2025-01-01"), // taxable
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
      date: new Date("2025-06-01"),
      feeUsd: 50,
    });

    const result = calculateGermanyFIFO(lots, event);

    // 45000 - 30000 - 50 = 14950
    expect(result.gainLoss).toBe(14950);
  });

  // ── Test 8: StrictSilo mode ───────────────────────
  it("should only match lots from same source in strictSilo mode", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        sourceId: "binance",
        acquiredAt: new Date("2025-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 35000,
        sourceId: "kraken",
        acquiredAt: new Date("2025-02-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
      date: new Date("2025-06-01"),
      sourceId: "kraken",
    });

    const result = calculateGermanyFIFO(lots, event, true);

    // Should only use lot-2 (kraken), not lot-1 (binance)
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-2");
    expect(result.gainLoss).toBe(10000); // 45000 - 35000
  });

  // ── Test 9: Holding period classification ─────────
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

    const result = calculateGermanyFIFO(lots, event);
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });
});
