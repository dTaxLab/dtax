/**
 * Internal Transfer Normalizer Tests
 *
 * Tests the matching engine that pairs TRANSFER_OUT/IN and BRIDGE_OUT/IN
 * events across wallets to avoid treating inter-wallet moves as taxable.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import {
  matchInternalTransfers,
  type TransferRecord,
} from "../normalizers/internal-transfer";

function makeTransfer(overrides: Partial<TransferRecord>): TransferRecord {
  return {
    id: "tx-1",
    sourceId: "exchange-1",
    type: "TRANSFER_OUT",
    timestamp: new Date("2025-01-15T10:00:00Z"),
    asset: "ETH",
    amount: 10,
    ...overrides,
  };
}

// ─── Basic Matching ──────────────────────────────

describe("matchInternalTransfers — basic matching", () => {
  it("matches a simple OUT→IN pair", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        sourceId: "binance",
        amount: 10,
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        sourceId: "metamask",
        amount: 10,
        timestamp: new Date("2025-01-15T10:30:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].outTx.id).toBe("out-1");
    expect(result.matched[0].inTx.id).toBe("in-1");
    expect(result.unmatchedOut).toHaveLength(0);
    expect(result.unmatchedIn).toHaveLength(0);
  });

  it("matches with network fee deduction (IN < OUT)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        amount: 10,
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        amount: 9.99,
        timestamp: new Date("2025-01-15T10:15:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].outTx.id).toBe("out-1");
    expect(result.matched[0].inTx.id).toBe("in-1");
  });

  it("returns empty matches for no transfers", () => {
    const result = matchInternalTransfers([]);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedOut).toHaveLength(0);
    expect(result.unmatchedIn).toHaveLength(0);
  });

  it("returns unmatched when only OUTs exist", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({ id: "out-1", type: "TRANSFER_OUT" }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedOut).toHaveLength(1);
    expect(result.unmatchedIn).toHaveLength(0);
  });

  it("returns unmatched when only INs exist", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({ id: "in-1", type: "TRANSFER_IN" }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedOut).toHaveLength(0);
    expect(result.unmatchedIn).toHaveLength(1);
  });
});

// ─── Asset Matching ──────────────────────────────

describe("matchInternalTransfers — asset filtering", () => {
  it("only matches same asset", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({ id: "out-1", type: "TRANSFER_OUT", asset: "ETH" }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        asset: "BTC",
        timestamp: new Date("2025-01-15T10:05:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedOut).toHaveLength(1);
    expect(result.unmatchedIn).toHaveLength(1);
  });

  it("matches correct asset when multiple assets present", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-eth",
        type: "TRANSFER_OUT",
        asset: "ETH",
        amount: 5,
      }),
      makeTransfer({
        id: "out-btc",
        type: "TRANSFER_OUT",
        asset: "BTC",
        amount: 1,
        timestamp: new Date("2025-01-15T10:01:00Z"),
      }),
      makeTransfer({
        id: "in-btc",
        type: "TRANSFER_IN",
        asset: "BTC",
        amount: 1,
        timestamp: new Date("2025-01-15T10:30:00Z"),
      }),
      makeTransfer({
        id: "in-eth",
        type: "TRANSFER_IN",
        asset: "ETH",
        amount: 5,
        timestamp: new Date("2025-01-15T10:30:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(2);

    const ethMatch = result.matched.find((m) => m.outTx.asset === "ETH");
    const btcMatch = result.matched.find((m) => m.outTx.asset === "BTC");
    expect(ethMatch?.inTx.id).toBe("in-eth");
    expect(btcMatch?.inTx.id).toBe("in-btc");
  });
});

// ─── Time Window ─────────────────────────────────

describe("matchInternalTransfers — time window", () => {
  it("rejects IN that is too far in the future (>24h default)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({ id: "out-1", type: "TRANSFER_OUT" }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        timestamp: new Date("2025-01-17T10:00:00Z"), // 48h later
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(0);
  });

  it("accepts custom time window", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({ id: "out-1", type: "TRANSFER_OUT" }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        timestamp: new Date("2025-01-17T10:00:00Z"), // 48h later
      }),
    ];

    // 72h window
    const result = matchInternalTransfers(transfers, 72 * 60 * 60 * 1000);
    expect(result.matched).toHaveLength(1);
  });

  it("allows up to 1 minute clock skew (IN before OUT)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        timestamp: new Date("2025-01-15T10:00:30Z"),
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        timestamp: new Date("2025-01-15T10:00:00Z"), // 30s before OUT
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
  });

  it("rejects IN that is too far before OUT (>1 min)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        timestamp: new Date("2025-01-15T10:05:00Z"),
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        timestamp: new Date("2025-01-15T10:00:00Z"), // 5 min before OUT
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(0);
  });
});

// ─── Best Match Selection ────────────────────────

describe("matchInternalTransfers — best match selection", () => {
  it("prefers exact amount match over partial", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        amount: 10,
      }),
      makeTransfer({
        id: "in-partial",
        type: "TRANSFER_IN",
        amount: 9.5,
        timestamp: new Date("2025-01-15T10:05:00Z"),
      }),
      makeTransfer({
        id: "in-exact",
        type: "TRANSFER_IN",
        amount: 10,
        timestamp: new Date("2025-01-15T10:10:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].inTx.id).toBe("in-exact");
  });

  it("prefers closer time when amounts are equal", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        amount: 10,
      }),
      makeTransfer({
        id: "in-far",
        type: "TRANSFER_IN",
        amount: 10,
        timestamp: new Date("2025-01-15T20:00:00Z"), // 10h later
      }),
      makeTransfer({
        id: "in-close",
        type: "TRANSFER_IN",
        amount: 10,
        timestamp: new Date("2025-01-15T10:05:00Z"), // 5min later
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].inTx.id).toBe("in-close");
  });
});

// ─── Multiple Matches ────────────────────────────

describe("matchInternalTransfers — multiple pairs", () => {
  it("matches multiple OUT→IN pairs", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        amount: 5,
        timestamp: new Date("2025-01-15T10:00:00Z"),
      }),
      makeTransfer({
        id: "out-2",
        type: "TRANSFER_OUT",
        amount: 3,
        timestamp: new Date("2025-01-15T11:00:00Z"),
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        amount: 5,
        timestamp: new Date("2025-01-15T10:15:00Z"),
      }),
      makeTransfer({
        id: "in-2",
        type: "TRANSFER_IN",
        amount: 3,
        timestamp: new Date("2025-01-15T11:15:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(2);
  });

  it("does not reuse an IN for multiple OUTs", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        amount: 10,
        timestamp: new Date("2025-01-15T10:00:00Z"),
      }),
      makeTransfer({
        id: "out-2",
        type: "TRANSFER_OUT",
        amount: 10,
        timestamp: new Date("2025-01-15T10:01:00Z"),
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        amount: 10,
        timestamp: new Date("2025-01-15T10:30:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedOut).toHaveLength(1);
  });
});

// ─── BRIDGE_OUT / BRIDGE_IN ──────────────────────

describe("matchInternalTransfers — bridge types", () => {
  it("matches BRIDGE_OUT → BRIDGE_IN", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "bridge-out",
        type: "BRIDGE_OUT",
        asset: "ETH",
        amount: 5,
      }),
      makeTransfer({
        id: "bridge-in",
        type: "BRIDGE_IN",
        asset: "ETH",
        amount: 4.99,
        timestamp: new Date("2025-01-15T11:00:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].outTx.type).toBe("BRIDGE_OUT");
    expect(result.matched[0].inTx.type).toBe("BRIDGE_IN");
  });

  it("matches BRIDGE_OUT → TRANSFER_IN (cross-type)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "bridge-out",
        type: "BRIDGE_OUT",
        asset: "USDC",
        amount: 1000,
      }),
      makeTransfer({
        id: "transfer-in",
        type: "TRANSFER_IN",
        asset: "USDC",
        amount: 1000,
        timestamp: new Date("2025-01-15T10:30:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
  });

  it("matches TRANSFER_OUT → BRIDGE_IN (cross-type)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "transfer-out",
        type: "TRANSFER_OUT",
        asset: "SOL",
        amount: 100,
      }),
      makeTransfer({
        id: "bridge-in",
        type: "BRIDGE_IN",
        asset: "SOL",
        amount: 99.9,
        timestamp: new Date("2025-01-15T10:30:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
  });
});

// ─── Edge Cases ──────────────────────────────────

describe("matchInternalTransfers — edge cases", () => {
  it("rejects IN amount significantly greater than OUT", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        amount: 5,
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        amount: 10, // 2x the OUT amount
        timestamp: new Date("2025-01-15T10:15:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(0);
  });

  it("accepts tiny floating point excess (within tolerance)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        amount: 10,
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        amount: 10.000000001, // Tiny fp excess
        timestamp: new Date("2025-01-15T10:15:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
  });

  it("handles transfers from same source (self-transfer)", () => {
    const transfers: TransferRecord[] = [
      makeTransfer({
        id: "out-1",
        type: "TRANSFER_OUT",
        sourceId: "wallet-1",
        amount: 5,
      }),
      makeTransfer({
        id: "in-1",
        type: "TRANSFER_IN",
        sourceId: "wallet-1", // Same source — still matches
        amount: 5,
        timestamp: new Date("2025-01-15T10:05:00Z"),
      }),
    ];

    const result = matchInternalTransfers(transfers);
    expect(result.matched).toHaveLength(1);
  });
});
