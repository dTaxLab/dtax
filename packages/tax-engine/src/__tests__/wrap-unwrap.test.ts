/**
 * Wrap/Unwrap Normalizer Tests
 *
 * Tests basis passthrough for token wrapping/unwrapping operations.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import {
  isWrapPair,
  getUnderlyingAsset,
  processWrapUnwrap,
} from "../normalizers/wrap-unwrap";
import type { TaxLot } from "../types";

// ─── isWrapPair ──────────────────────────────────

describe("isWrapPair", () => {
  it("detects WETH ↔ ETH", () => {
    expect(isWrapPair("WETH", "ETH")).toBe(true);
    expect(isWrapPair("ETH", "WETH")).toBe(true);
  });

  it("detects WBTC ↔ BTC", () => {
    expect(isWrapPair("WBTC", "BTC")).toBe(true);
    expect(isWrapPair("BTC", "WBTC")).toBe(true);
  });

  it("detects stETH ↔ ETH", () => {
    expect(isWrapPair("stETH", "ETH")).toBe(true);
    expect(isWrapPair("ETH", "stETH")).toBe(true);
  });

  it("detects cbETH ↔ ETH", () => {
    expect(isWrapPair("cbETH", "ETH")).toBe(true);
  });

  it("detects rETH ↔ ETH", () => {
    expect(isWrapPair("rETH", "ETH")).toBe(true);
  });

  it("detects WMATIC ↔ MATIC", () => {
    expect(isWrapPair("WMATIC", "MATIC")).toBe(true);
  });

  it("detects WSOL ↔ SOL", () => {
    expect(isWrapPair("WSOL", "SOL")).toBe(true);
  });

  it("rejects non-wrap pairs", () => {
    expect(isWrapPair("ETH", "BTC")).toBe(false);
    expect(isWrapPair("USDT", "USDC")).toBe(false);
    expect(isWrapPair("WETH", "BTC")).toBe(false);
  });

  it("rejects same asset", () => {
    expect(isWrapPair("ETH", "ETH")).toBe(false);
  });
});

// ─── getUnderlyingAsset ──────────────────────────

describe("getUnderlyingAsset", () => {
  it("returns ETH for WETH", () => {
    expect(getUnderlyingAsset("WETH")).toBe("ETH");
  });

  it("returns BTC for WBTC", () => {
    expect(getUnderlyingAsset("WBTC")).toBe("BTC");
  });

  it("returns ETH for stETH", () => {
    expect(getUnderlyingAsset("stETH")).toBe("ETH");
  });

  it("returns itself for non-wrapped asset", () => {
    expect(getUnderlyingAsset("ETH")).toBe("ETH");
    expect(getUnderlyingAsset("BTC")).toBe("BTC");
    expect(getUnderlyingAsset("SOL")).toBe("SOL");
  });
});

// ─── processWrapUnwrap ───────────────────────────

describe("processWrapUnwrap — single lot", () => {
  function makeLot(overrides: Partial<TaxLot> = {}): TaxLot {
    return {
      id: "lot-1",
      asset: "ETH",
      amount: 10,
      costBasisUsd: 20000,
      acquiredAt: new Date("2024-01-15T00:00:00Z"),
      sourceId: "exchange-1",
      ...overrides,
    };
  }

  it("wraps full lot ETH → WETH with basis passthrough", () => {
    const lots = [makeLot()];
    const result = processWrapUnwrap(lots, {
      id: "wrap-1",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 10,
      feeUsd: 0,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "exchange-1",
    });

    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].asset).toBe("WETH");
    expect(result.newLots[0].amount).toBe(10);
    expect(result.newLots[0].costBasisUsd).toBe(20000);
    // Acquisition date preserved
    expect(result.newLots[0].acquiredAt).toEqual(
      new Date("2024-01-15T00:00:00Z"),
    );
    expect(result.basisCarriedOver).toBe(20000);
    // Original lot consumed
    expect(lots[0].amount).toBe(0);
  });

  it("wraps partial lot", () => {
    const lots = [makeLot()];
    const result = processWrapUnwrap(lots, {
      id: "wrap-2",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 4,
      feeUsd: 0,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "exchange-1",
    });

    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].amount).toBe(4);
    expect(result.newLots[0].costBasisUsd).toBe(8000); // 4/10 * 20000
    expect(result.basisCarriedOver).toBe(8000);
    // Original lot partially consumed
    expect(lots[0].amount).toBe(6);
    expect(lots[0].costBasisUsd).toBe(12000);
  });

  it("adds gas fee to new lot basis", () => {
    const lots = [makeLot()];
    const result = processWrapUnwrap(lots, {
      id: "wrap-3",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 10,
      feeUsd: 50,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "exchange-1",
    });

    expect(result.newLots[0].costBasisUsd).toBe(20050); // 20000 + 50 gas
    expect(result.feeAdded).toBe(50);
  });

  it("unwraps WETH → ETH", () => {
    const lots = [makeLot({ asset: "WETH" })];
    const result = processWrapUnwrap(lots, {
      id: "unwrap-1",
      fromAsset: "WETH",
      toAsset: "ETH",
      amount: 10,
      feeUsd: 0,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "exchange-1",
    });

    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].asset).toBe("ETH");
    expect(result.newLots[0].costBasisUsd).toBe(20000);
  });
});

describe("processWrapUnwrap — multiple lots (FIFO)", () => {
  it("consumes lots in FIFO order", () => {
    const lots: TaxLot[] = [
      {
        id: "lot-old",
        asset: "ETH",
        amount: 3,
        costBasisUsd: 6000,
        acquiredAt: new Date("2023-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
      {
        id: "lot-new",
        asset: "ETH",
        amount: 5,
        costBasisUsd: 15000,
        acquiredAt: new Date("2024-06-01T00:00:00Z"),
        sourceId: "ex-1",
      },
    ];

    const result = processWrapUnwrap(lots, {
      id: "wrap-multi",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 5,
      feeUsd: 0,
      timestamp: new Date("2024-09-01T00:00:00Z"),
      sourceId: "ex-1",
    });

    // Should consume all of lot-old (3) + 2 from lot-new
    expect(result.newLots).toHaveLength(2);
    expect(result.newLots[0].amount).toBe(3);
    expect(result.newLots[0].costBasisUsd).toBe(6000);
    expect(result.newLots[0].acquiredAt).toEqual(
      new Date("2023-01-01T00:00:00Z"),
    );
    expect(result.newLots[1].amount).toBe(2);
    expect(result.newLots[1].costBasisUsd).toBe(6000); // 2/5 * 15000
    expect(result.basisCarriedOver).toBe(12000);

    // Original lots mutated
    expect(lots[0].amount).toBe(0);
    expect(lots[1].amount).toBe(3);
  });

  it("distributes gas fee proportionally across multiple new lots", () => {
    const lots: TaxLot[] = [
      {
        id: "lot-a",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 30000,
        acquiredAt: new Date("2023-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
      {
        id: "lot-b",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 40000,
        acquiredAt: new Date("2024-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
    ];

    const result = processWrapUnwrap(lots, {
      id: "wrap-fee",
      fromAsset: "BTC",
      toAsset: "WBTC",
      amount: 2,
      feeUsd: 100,
      timestamp: new Date("2024-09-01T00:00:00Z"),
      sourceId: "ex-1",
    });

    // Each lot gets 50% of fee (equal amounts)
    expect(result.newLots[0].costBasisUsd).toBe(30050); // 30000 + 50
    expect(result.newLots[1].costBasisUsd).toBe(40050); // 40000 + 50
  });
});

describe("processWrapUnwrap — edge cases", () => {
  it("handles zero amount gracefully", () => {
    const lots: TaxLot[] = [
      {
        id: "lot-1",
        asset: "ETH",
        amount: 10,
        costBasisUsd: 20000,
        acquiredAt: new Date("2024-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
    ];

    const result = processWrapUnwrap(lots, {
      id: "wrap-zero",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 0,
      feeUsd: 0,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "ex-1",
    });

    expect(result.newLots).toHaveLength(0);
    expect(result.basisCarriedOver).toBe(0);
    expect(lots[0].amount).toBe(10); // Unchanged
  });

  it("handles insufficient lots (wraps what's available)", () => {
    const lots: TaxLot[] = [
      {
        id: "lot-small",
        asset: "ETH",
        amount: 2,
        costBasisUsd: 4000,
        acquiredAt: new Date("2024-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
    ];

    const result = processWrapUnwrap(lots, {
      id: "wrap-over",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 10,
      feeUsd: 0,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "ex-1",
    });

    // Only wraps 2 (what's available)
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].amount).toBe(2);
    expect(result.basisCarriedOver).toBe(4000);
  });

  it("skips lots with zero amount", () => {
    const lots: TaxLot[] = [
      {
        id: "lot-empty",
        asset: "ETH",
        amount: 0,
        costBasisUsd: 0,
        acquiredAt: new Date("2023-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
      {
        id: "lot-full",
        asset: "ETH",
        amount: 5,
        costBasisUsd: 10000,
        acquiredAt: new Date("2024-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
    ];

    const result = processWrapUnwrap(lots, {
      id: "wrap-skip",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 3,
      feeUsd: 0,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "ex-1",
    });

    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].amount).toBe(3);
    expect(result.newLots[0].costBasisUsd).toBe(6000); // 3/5 * 10000
  });

  it("ignores lots of different asset", () => {
    const lots: TaxLot[] = [
      {
        id: "lot-btc",
        asset: "BTC",
        amount: 5,
        costBasisUsd: 100000,
        acquiredAt: new Date("2024-01-01T00:00:00Z"),
        sourceId: "ex-1",
      },
    ];

    const result = processWrapUnwrap(lots, {
      id: "wrap-diff",
      fromAsset: "ETH",
      toAsset: "WETH",
      amount: 1,
      feeUsd: 0,
      timestamp: new Date("2024-06-01T00:00:00Z"),
      sourceId: "ex-1",
    });

    expect(result.newLots).toHaveLength(0);
    expect(lots[0].amount).toBe(5); // Unchanged
  });
});
