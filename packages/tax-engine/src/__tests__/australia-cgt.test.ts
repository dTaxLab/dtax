/**
 * Australia CGT Discount Method Unit Tests (ATO Section 115)
 *
 * Tests cover:
 * 1. Short-term gain — full gain (no discount)
 * 2. Long-term gain — 50% discount applied
 * 3. Long-term loss — loss NOT discounted (full deduction)
 * 4. Short-term loss — full loss
 * 5. Mixed lots (one short, one long) — partial discount
 * 6. Exact 12-month boundary — not long-term (discount NOT applied)
 * 7. One day past 12 months — long-term (discount applied)
 * 8. Fee handling
 * 9. StrictSilo mode
 * 10. Holding period classification
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { calculateAustraliaCGT } from "../methods/australia-cgt";
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

describe("calculateAustraliaCGT", () => {
  // ── Test 1: Short-term gain (< 12 months) ─────────
  it("should calculate full gain when held less than 12 months", () => {
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
      date: new Date("2025-06-01"), // 5 months — short-term
    });

    const result = calculateAustraliaCGT(lots, event);

    // No discount — full gain
    expect(result.gainLoss).toBe(15000); // 45000 - 30000
    expect(result.method).toBe("AU_CGT_DISCOUNT");
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].fullyConsumed).toBe(true);
  });

  // ── Test 2: Long-term gain (> 12 months) ──────────
  it("should apply 50% discount on long-term gains", () => {
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
      proceedsUsd: 50000,
      date: new Date("2025-06-01"), // > 2 years
    });

    const result = calculateAustraliaCGT(lots, event);

    // Gross gain = 50000 - 30000 = 20000; discounted = 20000 * 0.5 = 10000
    expect(result.gainLoss).toBe(10000);
    expect(result.method).toBe("AU_CGT_DISCOUNT");
  });

  // ── Test 3: Long-term loss — NOT discounted ────────
  it("should NOT discount long-term losses", () => {
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
      proceedsUsd: 7500, // $1500/ETH — a loss
      date: new Date("2025-06-01"), // > 2 years
    });

    const result = calculateAustraliaCGT(lots, event);

    // Loss is preserved at full face value — no 50% discount
    expect(result.gainLoss).toBe(-2500); // 7500 - 10000
  });

  // ── Test 4: Short-term loss ────────────────────────
  it("should preserve full short-term loss", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        amount: 2.0,
        costBasisUsd: 6000, // $3000/ETH
        acquiredAt: new Date("2025-03-01"),
      }),
    ];

    const event = createEvent({
      asset: "ETH",
      amount: 2.0,
      proceedsUsd: 4000, // $2000/ETH
      date: new Date("2025-06-01"), // 3 months
    });

    const result = calculateAustraliaCGT(lots, event);

    expect(result.gainLoss).toBe(-2000); // 4000 - 6000
  });

  // ── Test 5: Mixed lots — partial discount ──────────
  it("should apply 50% only to long-term portion in mixed lots", () => {
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
      proceedsUsd: 60000, // $60k/BTC
      date: new Date("2025-06-01"),
    });

    const result = calculateAustraliaCGT(lots, event);

    // lot-1 (0.5 BTC, long-term):
    //   proceeds = 0.5 * 60000 = 30000, cost = 15000, gross gain = 15000
    //   discounted = 15000 * 0.5 = 7500
    // lot-2 (0.5 BTC, short-term):
    //   proceeds = 0.5 * 60000 = 30000, cost = 20000, gain = 10000
    // total = 7500 + 10000 = 17500
    expect(result.gainLoss).toBe(17500);
    expect(result.matchedLots).toHaveLength(2);
  });

  // ── Test 6: Exact 12-month boundary (NOT long-term) ─
  it("should NOT apply discount when sold exactly 12 months after purchase (day after rule)", () => {
    // ATO rule: count from day AFTER acquisition
    // Bought 2024-01-01 → day after = 2024-01-02 → one year later = 2025-01-02
    // Selling on 2025-01-01 is NOT long-term
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2024-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-01-01"), // exactly 12 calendar months — NOT long-term by ATO rule
    });

    const result = calculateAustraliaCGT(lots, event);

    // Full gain — no discount
    expect(result.gainLoss).toBe(20000); // 50000 - 30000
  });

  // ── Test 7: One day past 12-month threshold ────────
  it("should apply discount when sold one day past the 12-month ATO threshold", () => {
    // Bought 2024-01-01 → day after = 2024-01-02 → threshold = 2025-01-02
    // Selling on 2025-01-02 IS long-term
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2024-01-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-01-02"), // one day past threshold
    });

    const result = calculateAustraliaCGT(lots, event);

    // Discounted: (50000 - 30000) * 0.5 = 10000
    expect(result.gainLoss).toBe(10000);
  });

  // ── Test 8: Fee handling ───────────────────────────
  it("should deduct fees before applying 50% discount", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2023-01-01"), // long-term
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-06-01"),
      feeUsd: 200,
    });

    const result = calculateAustraliaCGT(lots, event);

    // Gross gain = 50000 - 30000 - 200 = 19800; discounted = 19800 * 0.5 = 9900
    expect(result.gainLoss).toBe(9900);
  });

  it("should deduct fees from short-term gains without discount", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2025-01-01"), // short-term
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
      date: new Date("2025-06-01"),
      feeUsd: 50,
    });

    const result = calculateAustraliaCGT(lots, event);

    // 45000 - 30000 - 50 = 14950 (no discount)
    expect(result.gainLoss).toBe(14950);
  });

  // ── Test 9: StrictSilo mode ───────────────────────
  it("should only match lots from same source in strictSilo mode", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 30000,
        sourceId: "binance",
        acquiredAt: new Date("2023-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 35000,
        sourceId: "kraken",
        acquiredAt: new Date("2023-02-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 50000,
      date: new Date("2025-06-01"),
      sourceId: "kraken",
    });

    const result = calculateAustraliaCGT(lots, event, true);

    // Should only use lot-2 (kraken)
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-2");
    // Gain = (50000 - 35000) * 0.5 = 7500 (long-term discount)
    expect(result.gainLoss).toBe(7500);
  });

  // ── Test 10: Holding period classification ─────────
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

    const result = calculateAustraliaCGT(lots, event);
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });
});
