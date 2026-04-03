/**
 * Spain CGT (Ganancias y Pérdidas Patrimoniales) Unit Tests — IRPF/AEAT
 *
 * Tests cover:
 * 1. Method tag is ES_CGT
 * 2. Gain — raw FIFO result (tiered rates applied at UI layer)
 * 3. Loss — passes through as negative (losses can offset same-year gains)
 * 4. Mixed lots — FIFO order preserved
 * 5. Fee handling
 * 6. StrictSilo mode
 * 7. Holding period classification
 * 8. Same gainLoss as FIFO for identical inputs
 *
 * Note: tiered 19–27% rates and loss carry-forward are UI concerns;
 * engine returns raw gainLoss identical to FIFO with ES_CGT tag.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { calculateSpainCGT } from "../methods/spain-cgt";
import { calculateFIFO } from "../methods/fifo";
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

describe("calculateSpainCGT", () => {
  // ── Test 1: Method tag is ES_CGT ──────────────────
  it("should return ES_CGT method tag", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const event = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 45000 });

    const result = calculateSpainCGT(lots, event);

    expect(result.method).toBe("ES_CGT");
  });

  // ── Test 2: Gain — identical to FIFO ─────────────
  it("should produce the same gainLoss as FIFO", () => {
    const lotsES = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const lotsFIFO = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const eventES = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 45000 });
    const eventFIFO = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 45000 });

    const esResult = calculateSpainCGT(lotsES, eventES);
    const fifoResult = calculateFIFO(lotsFIFO, eventFIFO);

    expect(esResult.gainLoss).toBe(fifoResult.gainLoss);
    expect(esResult.gainLoss).toBe(15000); // 45000 - 30000
  });

  // ── Test 3: Loss passes through ───────────────────
  it("should pass through losses (deductible against same-year gains)", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "ETH", amount: 2.0, costBasisUsd: 8000 }),
    ];
    const event = createEvent({ asset: "ETH", amount: 2.0, proceedsUsd: 6000 });

    const result = calculateSpainCGT(lots, event);

    expect(result.gainLoss).toBe(-2000); // 6000 - 8000 — NOT zeroed (unlike IN)
  });

  // ── Test 4: Mixed lots — FIFO order ───────────────
  it("should consume lots in FIFO order", () => {
    const lots = [
      createLot({
        id: "lot-old",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 10000,
        acquiredAt: new Date("2022-01-01"),
      }),
      createLot({
        id: "lot-new",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 25000,
        acquiredAt: new Date("2024-06-01"),
      }),
    ];
    const event = createEvent({
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 20000,
    });

    const result = calculateSpainCGT(lots, event);

    // FIFO: lot-old consumed; gain = 20000 - 10000 = 10000
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-old");
    expect(result.gainLoss).toBe(10000);
  });

  // ── Test 5: Fee handling ───────────────────────────
  it("should deduct fees from gain", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 45000,
      feeUsd: 200,
    });

    const result = calculateSpainCGT(lots, event);

    expect(result.gainLoss).toBe(14800); // 45000 - 30000 - 200
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
        id: "lot-kraken",
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

    const result = calculateSpainCGT(lots, event, true);

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-kraken");
    expect(result.gainLoss).toBe(5000); // 45000 - 40000
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

    const result = calculateSpainCGT(lots, event);

    // Spain does not differentiate by holding period, but engine still classifies
    expect(result.holdingPeriod).toBe("LONG_TERM");
  });
});
