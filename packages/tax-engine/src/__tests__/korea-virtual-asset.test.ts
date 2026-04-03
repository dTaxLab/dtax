/**
 * Korea Virtual Asset Income Tax Unit Tests (가상자산소득세) — VAIA 2023
 *
 * Tests cover:
 * 1. Basic gain — standard FIFO result with KR_VIRTUAL_ASSET method tag
 * 2. Loss — passes through as negative (no restriction, unlike IN)
 * 3. Mixed lots — FIFO ordering preserved
 * 4. Fee handling
 * 5. StrictSilo mode
 * 6. Holding period classification
 * 7. Method tag is "KR_VIRTUAL_ASSET" (not "FIFO")
 *
 * Note: ₩2.5M exemption and 22% rate are UI-layer concerns only;
 * these tests verify the engine returns raw gainLoss identical to FIFO.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { calculateKoreaVirtualAsset } from "../methods/korea-virtual-asset";
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

describe("calculateKoreaVirtualAsset", () => {
  // ── Test 1: Method tag is KR_VIRTUAL_ASSET ────────
  it("should return KR_VIRTUAL_ASSET method tag", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const event = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 45000 });

    const result = calculateKoreaVirtualAsset(lots, event);

    expect(result.method).toBe("KR_VIRTUAL_ASSET");
  });

  // ── Test 2: Basic gain — identical to FIFO ────────
  it("should produce the same gainLoss as FIFO", () => {
    const lotsForKR = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const lotsForFIFO = [
      createLot({ id: "lot-1", asset: "BTC", amount: 1.0, costBasisUsd: 30000 }),
    ];
    const eventKR = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 45000 });
    const eventFIFO = createEvent({ asset: "BTC", amount: 1.0, proceedsUsd: 45000 });

    const krResult = calculateKoreaVirtualAsset(lotsForKR, eventKR);
    const fifoResult = calculateFIFO(lotsForFIFO, eventFIFO);

    expect(krResult.gainLoss).toBe(fifoResult.gainLoss);
    expect(krResult.gainLoss).toBe(15000); // 45000 - 30000
  });

  // ── Test 3: Loss passes through (no zeroing) ──────
  it("should pass through losses without modification", () => {
    const lots = [
      createLot({ id: "lot-1", asset: "ETH", amount: 2.0, costBasisUsd: 8000 }),
    ];
    const event = createEvent({
      asset: "ETH",
      amount: 2.0,
      proceedsUsd: 6000, // loss
    });

    const result = calculateKoreaVirtualAsset(lots, event);

    expect(result.gainLoss).toBe(-2000); // 6000 - 8000
  });

  // ── Test 4: Mixed lots — FIFO ordering preserved ──
  it("should consume lots in FIFO (oldest first) order", () => {
    const lots = [
      createLot({
        id: "lot-old",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 10000, // $20k/BTC, older
        acquiredAt: new Date("2023-01-01"),
      }),
      createLot({
        id: "lot-new",
        asset: "BTC",
        amount: 0.5,
        costBasisUsd: 25000, // $50k/BTC, newer
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 30000,
    });

    const result = calculateKoreaVirtualAsset(lots, event);

    // FIFO: only lot-old consumed; gain = 30000 - 10000 = 20000
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-old");
    expect(result.gainLoss).toBe(20000);
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
      feeUsd: 100,
    });

    const result = calculateKoreaVirtualAsset(lots, event);

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
        id: "lot-upbit",
        asset: "BTC",
        amount: 1.0,
        costBasisUsd: 35000,
        sourceId: "upbit",
      }),
    ];
    const event = createEvent({
      asset: "BTC",
      amount: 1.0,
      proceedsUsd: 40000,
      sourceId: "upbit",
    });

    const result = calculateKoreaVirtualAsset(lots, event, true);

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("lot-upbit");
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

    const result = calculateKoreaVirtualAsset(lots, event);

    expect(result.holdingPeriod).toBe("LONG_TERM");
  });
});
