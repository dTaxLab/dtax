/**
 * Precision & Edge Case Tests
 *
 * Tests cover:
 * 1. Very large amounts (whale transactions)
 * 2. Very small amounts (dust/satoshi)
 * 3. Negative gain/loss precision
 * 4. Zero amount edge cases
 * 5. Multi-lot fractional consumption
 * 6. Large number of lots
 * 7. Same-second transactions
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import type { TaxLot, TaxableEvent, CalculationResult } from "../types";

// ─── Helpers ─────────────────────────────────────────

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

/** Sum cost basis from matched lots */
function totalCostBasis(r: CalculationResult): number {
  return r.matchedLots.reduce((sum, m) => sum + m.costBasisUsd, 0);
}

// ─── Tests ──────────────────────────────────────────

describe("Precision & Edge Cases", () => {
  // ── 1. Whale transaction: very large BTC amount ──
  it("should handle whale-size BTC transactions (1000 BTC)", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "BTC",
        amount: 1000,
        costBasisUsd: 30_000_000, // $30k per BTC
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "BTC",
        amount: 1000,
        proceedsUsd: 50_000_000, // $50k per BTC
      }),
    );

    expect(result.gainLoss).toBe(20_000_000);
    expect(totalCostBasis(result)).toBe(30_000_000);
    expect(result.event.proceedsUsd).toBe(50_000_000);
  });

  // ── 2. Very large USD values ──
  it("should handle $100M+ transaction values", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "ETH",
        amount: 50000,
        costBasisUsd: 100_000_000,
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "ETH",
        amount: 50000,
        proceedsUsd: 150_000_000,
      }),
    );

    expect(result.gainLoss).toBe(50_000_000);
  });

  // ── 3. Dust/small amounts ──
  it("should handle small BTC amounts (0.001 BTC)", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "BTC",
        amount: 0.001,
        costBasisUsd: 50,
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "BTC",
        amount: 0.001,
        proceedsUsd: 70,
      }),
    );

    expect(result.gainLoss).toBe(20);
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].costBasisUsd).toBe(50);
  });

  // ── 4. Sub-cent USD values (ERC-20 dust) ──
  it("should handle sub-cent USD values", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "SHIB",
        amount: 1000000,
        costBasisUsd: 0.01,
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "SHIB",
        amount: 1000000,
        proceedsUsd: 0.02,
      }),
    );

    expect(result.gainLoss).toBeCloseTo(0.01, 6);
  });

  // ── 5. Exact break-even (zero gain) ──
  it("should produce exactly zero gain on break-even sale", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 50000,
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "BTC",
        amount: 1.0,
        proceedsUsd: 50000,
      }),
    );

    expect(result.gainLoss).toBe(0);
  });

  // ── 6. Multi-lot fractional consumption with precision ──
  it("should maintain precision across multiple partial lot matches", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        id: "lot-a",
        asset: "ETH",
        amount: 0.333333,
        costBasisUsd: 666.666,
      }),
      createLot({
        id: "lot-b",
        asset: "ETH",
        amount: 0.333333,
        costBasisUsd: 666.666,
      }),
      createLot({
        id: "lot-c",
        asset: "ETH",
        amount: 0.333334,
        costBasisUsd: 666.668,
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "ETH",
        amount: 1.0,
        proceedsUsd: 3000,
      }),
    );

    expect(result.matchedLots.length).toBeGreaterThanOrEqual(3);
    expect(totalCostBasis(result)).toBeCloseTo(2000, 0);
    expect(result.gainLoss).toBeCloseTo(1000, 0);
  });

  // ── 7. Large number of tiny lots ──
  it("should handle 100 micro-lots consumed in one sale", () => {
    const calc = new CostBasisCalculator("FIFO");
    const lots: TaxLot[] = [];
    for (let i = 0; i < 100; i++) {
      lots.push(
        createLot({
          id: `micro-${i}`,
          asset: "SOL",
          amount: 0.01,
          costBasisUsd: 1.0,
        }),
      );
    }
    calc.addLots(lots);

    const result = calc.calculate(
      createEvent({
        asset: "SOL",
        amount: 1.0,
        proceedsUsd: 200,
      }),
    );

    expect(result.matchedLots).toHaveLength(100);
    expect(totalCostBasis(result)).toBeCloseTo(100, 0);
    expect(result.gainLoss).toBeCloseTo(100, 0);
  });

  // ── 8. Same-second transactions (ordering) ──
  it("should handle multiple lots acquired at the same second", () => {
    const sameTime = new Date("2024-06-15T12:00:00Z");
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        id: "same-1",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 15000,
        acquiredAt: sameTime,
      }),
      createLot({
        id: "same-2",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 15500,
        acquiredAt: sameTime,
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "BTC",
        amount: 0.5,
        proceedsUsd: 20000,
      }),
    );

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].costBasisUsd).toBe(15000); // FIFO: first lot added
  });

  // ── 9. Large loss scenario ──
  it("should correctly calculate large losses (90% drawdown)", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "LUNA",
        amount: 10000,
        costBasisUsd: 1_000_000, // $100/LUNA
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "LUNA",
        amount: 10000,
        proceedsUsd: 100, // $0.01/LUNA
      }),
    );

    expect(result.gainLoss).toBe(-999_900);
    // Acquired 2024-01-01, sold 2025-06-01 = >1 year = LONG_TERM
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // ── 10. Zero-cost lot (free airdrop) with fee ──
  it("should handle zero-cost lot sold with fee deduction", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "UNI",
        amount: 400,
        costBasisUsd: 0,
        acquiredAt: new Date("2023-01-01"),
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "UNI",
        amount: 400,
        proceedsUsd: 4000,
        feeUsd: 10,
      }),
    );

    expect(totalCostBasis(result)).toBe(0);
    expect(result.gainLoss).toBe(3990); // proceeds - fee - costBasis
  });

  // ── 11. Partial sell from partial lot (nested fractions) ──
  it("should handle selling fraction of a partially consumed lot", () => {
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots([
      createLot({
        asset: "ETH",
        amount: 10.0,
        costBasisUsd: 20000,
      }),
    ]);

    // First sell: 3 ETH
    const r1 = calc.calculate(
      createEvent({
        id: "sell-1",
        asset: "ETH",
        amount: 3.0,
        proceedsUsd: 9000,
      }),
    );
    expect(totalCostBasis(r1)).toBe(6000); // 3/10 * 20000

    // Second sell: 2.5 ETH from remaining 7 ETH
    const r2 = calc.calculate(
      createEvent({
        id: "sell-2",
        asset: "ETH",
        amount: 2.5,
        proceedsUsd: 8000,
      }),
    );
    expect(totalCostBasis(r2)).toBe(5000); // 2.5/10 * 20000
    expect(r2.gainLoss).toBe(3000);
  });

  // ── 12. HIFO precision with close cost bases ──
  it("HIFO should pick highest cost lot when costs are very close", () => {
    const calc = new CostBasisCalculator("HIFO");
    calc.addLots([
      createLot({
        id: "hifo-a",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 50000.01,
      }),
      createLot({
        id: "hifo-b",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 50000.02,
      }),
      createLot({
        id: "hifo-c",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 50000.0,
      }),
    ]);

    const result = calc.calculate(
      createEvent({
        asset: "BTC",
        amount: 1.0,
        proceedsUsd: 60000,
      }),
    );

    expect(result.matchedLots[0].lotId).toBe("hifo-b"); // highest: $50,000.02
    expect(result.matchedLots[0].costBasisUsd).toBeCloseTo(50000.02, 2);
  });
});
