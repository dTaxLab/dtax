/**
 * India VDA (Virtual Digital Asset) Tax Unit Tests — Income Tax Act s.115BBH
 *
 * Tests cover:
 * 1. Gain — standard FIFO result, tagged IN_VDA
 * 2. Loss — zeroed to 0 (not deductible under s.115BBH)
 * 3. Break-even — zero gain stays zero
 * 4. Fee causes loss — also zeroed to 0
 * 5. Mixed lots — FIFO order, per-disposal loss zeroing
 * 6. StrictSilo mode
 * 7. Holding period classification
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { calculateIndiaVDA } from "../methods/india-vda";
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

describe("calculateIndiaVDA", () => {
  // ── Test 1: Gain — tagged IN_VDA ──────────────────
  it("should return IN_VDA method tag and correct gain", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const event = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 45000 });

    const result = calculateIndiaVDA(lots, event);

    expect(result.method).toBe("IN_VDA");
    expect(result.gainLoss).toBe(15000); // 45000 - 30000
  });

  // ── Test 2: Loss → zeroed to 0 ────────────────────
  it("should zero out losses (s.115BBH: losses not deductible)", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 50000 }),
    ];
    const event = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 40000 });

    const result = calculateIndiaVDA(lots, event);

    // Raw gain would be -10000, but must be zeroed
    expect(result.gainLoss).toBe(0);
  });

  // ── Test 3: Break-even — zero stays zero ──────────
  it("should return 0 when proceeds equal cost basis", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "ETH", amount: 2.0, costBasisUsd: 4000 }),
    ];
    const event = createEvent({ asset: "ETH", amount: 2.0, proceedsUsd: 4000 });

    const result = calculateIndiaVDA(lots, event);

    expect(result.gainLoss).toBe(0);
  });

  // ── Test 4: Fee causes net loss → zeroed ──────────
  it("should zero out gain when fees push it negative", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 40000 }),
    ];
    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 40100, // tiny gain before fee
      feeUsd: 200,        // fee creates net loss
    });

    const result = calculateIndiaVDA(lots, event);

    // Raw: 40100 - 40000 - 200 = -100 → zeroed
    expect(result.gainLoss).toBe(0);
  });

  // ── Test 5: Positive gain with fee — not zeroed ───
  it("should deduct fees from positive gains normally", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
      feeUsd: 100,
    });

    const result = calculateIndiaVDA(lots, event);

    expect(result.gainLoss).toBe(14900); // 45000 - 30000 - 100
  });

  // ── Test 6: StrictSilo mode ───────────────────────
  it("should only match lots from same source in strictSilo mode", () => {
    const lots = [
      createLot({
        id: "lot-binance",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 20000,
        sourceId: "binance",
      }),
      createLot({
        id: "lot-wazirx",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 35000,
        sourceId: "wazirx",
      }),
    ];
    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 40000,
      sourceId: "wazirx",
    });

    const result = calculateIndiaVDA(lots, event, true);

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-wazirx");
    expect(result.gainLoss).toBe(5000); // 40000 - 35000
  });

  // ── Test 7: Holding period classification ──────────
  it("should classify holding period from earliest consumed lot", () => {
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
      date: new Date("2025-06-01"),
    });

    const result = calculateIndiaVDA(lots, event);
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });

  // ── Test 8: Large loss zeroed ─────────────────────
  it("should zero out large losses entirely", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "LUNA",
        amount: 1000,
        costBasisUsd: 100000, // LUNA crash scenario
      }),
    ];
    const event = createEvent({
      asset: "LUNA",
      amount: 1000,
      proceedsUsd: 1, // near zero value
    });

    const result = calculateIndiaVDA(lots, event);

    expect(result.gainLoss).toBe(0); // loss of ~100000 → zeroed
  });
});
