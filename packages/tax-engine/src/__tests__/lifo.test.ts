/**
 * LIFO Tax Calculation Unit Tests
 *
 * Key difference from FIFO: newest lots consumed first.
 * Test strategy: use identical data to FIFO tests, verify different lot matching order.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect, vi } from "vitest";
import { calculateLIFO } from "../methods/lifo";
import type { TaxLot, TaxableEvent } from "../types";

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

describe("calculateLIFO", () => {
  // ── Test 1: Basic LIFO — should consume NEWEST lot first ──
  it("should consume the newest lot first", () => {
    const lots = [
      createLot({
        id: "old",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 20000,
        acquiredAt: new Date("2023-01-01"),
      }),
      createLot({
        id: "new",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 50000,
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 0.5,
      proceedsUsd: 30000,
    });
    const result = calculateLIFO(lots, event);

    // LIFO: should match 'new' lot (2024-06-01), not 'old' (2023-01-01)
    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("new");
    expect(result.matchedLots[0].amountConsumed).toBe(0.5);
    expect(result.method).toBe("LIFO");
  });

  // ── Test 2: LIFO with multiple lots spanning ──
  it("should span from newest to oldest when selling more than newest lot", () => {
    const lots = [
      createLot({
        id: "lot-1",
        asset: "ETH",
        sourceId: "binance-1",
        amount: 2.0,
        costBasisUsd: 4000,
        acquiredAt: new Date("2023-01-01"),
      }),
      createLot({
        id: "lot-2",
        asset: "ETH",
        sourceId: "binance-1",
        amount: 3.0,
        costBasisUsd: 9000,
        acquiredAt: new Date("2024-01-01"),
      }),
      createLot({
        id: "lot-3",
        asset: "ETH",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 3500,
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    // Sell 4 ETH — LIFO order: lot-3 (1), lot-2 (3) = 4 total
    const event = createEvent({
      asset: "ETH",
      sourceId: "binance-1",
      amount: 4.0,
      proceedsUsd: 16000,
    });
    const result = calculateLIFO(lots, event);

    expect(result.matchedLots).toHaveLength(2);
    expect(result.matchedLots[0].lotId).toBe("lot-3"); // newest first
    expect(result.matchedLots[0].amountConsumed).toBe(1.0);
    expect(result.matchedLots[1].lotId).toBe("lot-2"); // then next newest
    expect(result.matchedLots[1].amountConsumed).toBe(3.0);

    // Cost basis: lot-3 ($3500) + lot-2 ($9000) = $12,500
    // Gain: $16,000 - $12,500 = $3,500
    expect(result.gainLoss).toBeCloseTo(3500, 2);
  });

  // ── Test 3: Short-term holding with recent lot ──
  it("should classify as SHORT_TERM when newest lot is recent", () => {
    const lots = [
      createLot({
        id: "old",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 20000,
        acquiredAt: new Date("2023-01-01"),
      }),
      createLot({
        id: "recent",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 40000,
        acquiredAt: new Date("2025-03-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 0.5,
      proceedsUsd: 25000,
      date: new Date("2025-06-01"),
    });
    const result = calculateLIFO(lots, event);

    // LIFO consumes 'recent' (2025-03-01), held < 1 year
    expect(result.matchedLots[0].lotId).toBe("recent");
    // Holding period: based on earliest matched lot in the match set
    // Only 'recent' is matched, so it's SHORT_TERM
    expect(result.holdingPeriod).toBe("SHORT_TERM");
  });

  // ── Test 4: LIFO vs FIFO gives different gains ──
  it("should produce different gain than FIFO with same data", () => {
    const lots = [
      createLot({
        id: "cheap",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 10000,
        acquiredAt: new Date("2023-01-01"),
      }),
      createLot({
        id: "expensive",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 50000,
        acquiredAt: new Date("2024-06-01"),
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 45000,
    });
    const result = calculateLIFO(lots, event);

    // LIFO: consumes 'expensive' ($50k) → loss = $45k - $50k = -$5k
    // FIFO would consume 'cheap' ($10k) → gain = $45k - $10k = +$35k
    expect(result.gainLoss).toBeCloseTo(-5000, 2);
    expect(result.matchedLots[0].lotId).toBe("expensive");
  });

  // ── Test 5: Fee deduction ──
  it("should deduct fees from gain", () => {
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
      amount: 1.0,
      proceedsUsd: 40000,
      feeUsd: 100,
    });
    const result = calculateLIFO(lots, event);

    expect(result.gainLoss).toBeCloseTo(9900, 2);
  });

  // ── Test 6: Insufficient lots ──
  it("should warn when lots are insufficient", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lots = [
      createLot({
        id: "lot-1",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 0.5,
        costBasisUsd: 15000,
      }),
    ];

    const event = createEvent({
      asset: "BTC",
      sourceId: "binance-1",
      amount: 1.0,
      proceedsUsd: 40000,
    });
    calculateLIFO(lots, event);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Insufficient lots"),
    );
    warnSpy.mockRestore();
  });

  // ── Test 7: Asset isolation ──
  it("should only match lots of the same asset", () => {
    const lots = [
      createLot({
        id: "btc-lot",
        asset: "BTC",
        sourceId: "binance-1",
        amount: 1.0,
        costBasisUsd: 30000,
        acquiredAt: new Date("2024-06-01"),
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
      amount: 0.5,
      proceedsUsd: 20000,
    });
    const result = calculateLIFO(lots, event);

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].lotId).toBe("btc-lot");
  });
});
