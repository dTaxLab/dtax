/**
 * CLI library function tests.
 * Tests parseArgs, toTaxLot, and toTaxableEvent pure functions.
 */

import { describe, it, expect } from "vitest";
import { parseArgs, toTaxLot, toTaxableEvent } from "../lib";
import type { ParsedTransaction } from "@dtax/tax-engine";

// ─── parseArgs ──────────────────────────────────

describe("parseArgs", () => {
  it("parses command and file", () => {
    const result = parseArgs(["calculate", "data.csv"]);
    expect(result.command).toBe("calculate");
    expect(result.file).toBe("data.csv");
    expect(result.flags).toEqual({});
  });

  it("parses flags with values", () => {
    const result = parseArgs([
      "calculate",
      "data.csv",
      "--method",
      "HIFO",
      "--year",
      "2025",
    ]);
    expect(result.command).toBe("calculate");
    expect(result.file).toBe("data.csv");
    expect(result.flags.method).toBe("HIFO");
    expect(result.flags.year).toBe("2025");
  });

  it("parses boolean flags", () => {
    const result = parseArgs(["calculate", "data.csv", "--json"]);
    expect(result.flags.json).toBe("true");
  });

  it("handles help command", () => {
    const result = parseArgs(["help"]);
    expect(result.command).toBe("help");
    expect(result.file).toBeUndefined();
  });

  it("handles --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBe("");
    expect(result.flags.help).toBe("true");
  });

  it("handles empty args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("");
    expect(result.file).toBeUndefined();
    expect(result.flags).toEqual({});
  });

  it("handles multiple flags before file", () => {
    const result = parseArgs(["calculate", "--method", "LIFO", "file.csv"]);
    expect(result.command).toBe("calculate");
    expect(result.file).toBe("file.csv");
    expect(result.flags.method).toBe("LIFO");
  });

  it("collects multiple files in files array", () => {
    const result = parseArgs([
      "calculate",
      "coinbase.csv",
      "binance.csv",
      "kraken.csv",
      "--method",
      "HIFO",
    ]);
    expect(result.command).toBe("calculate");
    expect(result.file).toBe("coinbase.csv");
    expect(result.files).toEqual(["coinbase.csv", "binance.csv", "kraken.csv"]);
    expect(result.flags.method).toBe("HIFO");
  });

  it("treats consecutive flags without values as boolean", () => {
    const result = parseArgs(["calculate", "f.csv", "--json", "--verbose"]);
    expect(result.flags.json).toBe("true");
    expect(result.flags.verbose).toBe("true");
  });

  it("parses --include-wash-sales and --schedule-d flags", () => {
    const result = parseArgs([
      "calculate",
      "f.csv",
      "--include-wash-sales",
      "--schedule-d",
      "--year",
      "2025",
    ]);
    expect(result.flags["include-wash-sales"]).toBe("true");
    expect(result.flags["schedule-d"]).toBe("true");
    expect(result.flags.year).toBe("2025");
  });

  it("parses --currency and --rate flags", () => {
    const result = parseArgs([
      "calculate",
      "f.csv",
      "--currency",
      "EUR",
      "--rate",
      "0.92",
    ]);
    expect(result.flags.currency).toBe("EUR");
    expect(result.flags.rate).toBe("0.92");
  });
});

// ─── toTaxLot ───────────────────────────────────

describe("toTaxLot", () => {
  const baseTx: ParsedTransaction = {
    type: "BUY",
    timestamp: "2025-01-15T10:00:00Z",
    receivedAsset: "BTC",
    receivedAmount: 1.5,
    receivedValueUsd: 45000,
  };

  it("creates lot from BUY transaction", () => {
    const lot = toTaxLot(baseTx, 0);
    expect(lot).not.toBeNull();
    expect(lot!.id).toBe("lot-0");
    expect(lot!.asset).toBe("BTC");
    expect(lot!.amount).toBe(1.5);
    expect(lot!.costBasisUsd).toBe(45000);
    expect(lot!.sourceId).toBe("csv");
  });

  it("creates lot from AIRDROP", () => {
    const lot = toTaxLot({ ...baseTx, type: "AIRDROP" }, 5);
    expect(lot).not.toBeNull();
    expect(lot!.id).toBe("lot-5");
  });

  it("creates lot from STAKING_REWARD", () => {
    const lot = toTaxLot({ ...baseTx, type: "STAKING_REWARD" }, 0);
    expect(lot).not.toBeNull();
  });

  it("creates lot from TRADE with received side", () => {
    const lot = toTaxLot(
      {
        type: "TRADE",
        timestamp: "2025-01-15T10:00:00Z",
        receivedAsset: "ETH",
        receivedAmount: 10,
        receivedValueUsd: 25000,
        sentAsset: "BTC",
        sentAmount: 0.5,
        sentValueUsd: 25000,
      },
      0,
    );
    expect(lot).not.toBeNull();
    expect(lot!.asset).toBe("ETH");
    expect(lot!.amount).toBe(10);
  });

  it("returns null for SELL", () => {
    const lot = toTaxLot(
      {
        type: "SELL",
        timestamp: "2025-01-15T10:00:00Z",
        sentAsset: "BTC",
        sentAmount: 1,
        sentValueUsd: 50000,
      },
      0,
    );
    expect(lot).toBeNull();
  });

  it("returns null for zero amount", () => {
    const lot = toTaxLot({ ...baseTx, receivedAmount: 0 }, 0);
    expect(lot).toBeNull();
  });

  it("returns null for missing asset", () => {
    const lot = toTaxLot({ ...baseTx, receivedAsset: undefined }, 0);
    expect(lot).toBeNull();
  });

  it("defaults costBasisUsd to 0 when undefined", () => {
    const lot = toTaxLot({ ...baseTx, receivedValueUsd: undefined }, 0);
    expect(lot).not.toBeNull();
    expect(lot!.costBasisUsd).toBe(0);
  });

  it("creates lot from TRANSFER_IN", () => {
    const lot = toTaxLot({ ...baseTx, type: "TRANSFER_IN" }, 0);
    expect(lot).not.toBeNull();
  });

  it("creates lot from MINING_REWARD", () => {
    const lot = toTaxLot({ ...baseTx, type: "MINING_REWARD" }, 0);
    expect(lot).not.toBeNull();
  });

  it("creates lot from INTEREST", () => {
    const lot = toTaxLot({ ...baseTx, type: "INTEREST" }, 0);
    expect(lot).not.toBeNull();
  });

  it("creates lot from GIFT_RECEIVED", () => {
    const lot = toTaxLot({ ...baseTx, type: "GIFT_RECEIVED" }, 0);
    expect(lot).not.toBeNull();
  });
});

// ─── toTaxableEvent ─────────────────────────────

describe("toTaxableEvent", () => {
  const baseSell: ParsedTransaction = {
    type: "SELL",
    timestamp: "2025-06-15T10:00:00Z",
    sentAsset: "BTC",
    sentAmount: 1,
    sentValueUsd: 50000,
    feeValueUsd: 15,
  };

  it("creates event from SELL", () => {
    const event = toTaxableEvent(baseSell, 0);
    expect(event).not.toBeNull();
    expect(event!.id).toBe("evt-0");
    expect(event!.asset).toBe("BTC");
    expect(event!.amount).toBe(1);
    expect(event!.proceedsUsd).toBe(50000);
    expect(event!.feeUsd).toBe(15);
  });

  it("creates event from GIFT_SENT", () => {
    const event = toTaxableEvent({ ...baseSell, type: "GIFT_SENT" }, 0);
    expect(event).not.toBeNull();
  });

  it("creates event from TRANSFER_OUT", () => {
    const event = toTaxableEvent({ ...baseSell, type: "TRANSFER_OUT" }, 0);
    expect(event).not.toBeNull();
  });

  it("creates event from TRADE with sent side", () => {
    const event = toTaxableEvent(
      {
        type: "TRADE",
        timestamp: "2025-06-15T10:00:00Z",
        sentAsset: "BTC",
        sentAmount: 0.5,
        sentValueUsd: 25000,
        receivedAsset: "ETH",
        receivedAmount: 10,
        receivedValueUsd: 25000,
      },
      0,
    );
    expect(event).not.toBeNull();
    expect(event!.asset).toBe("BTC");
    expect(event!.amount).toBe(0.5);
  });

  it("returns null for BUY", () => {
    const event = toTaxableEvent(
      {
        type: "BUY",
        timestamp: "2025-01-15T10:00:00Z",
        receivedAsset: "BTC",
        receivedAmount: 1,
        receivedValueUsd: 45000,
      },
      0,
    );
    expect(event).toBeNull();
  });

  it("returns null for zero amount", () => {
    const event = toTaxableEvent({ ...baseSell, sentAmount: 0 }, 0);
    expect(event).toBeNull();
  });

  it("returns null for missing asset", () => {
    const event = toTaxableEvent({ ...baseSell, sentAsset: undefined }, 0);
    expect(event).toBeNull();
  });

  it("defaults fee to 0 when undefined", () => {
    const event = toTaxableEvent({ ...baseSell, feeValueUsd: undefined }, 0);
    expect(event).not.toBeNull();
    expect(event!.feeUsd).toBe(0);
  });

  it("defaults proceeds to 0 when undefined", () => {
    const event = toTaxableEvent({ ...baseSell, sentValueUsd: undefined }, 0);
    expect(event).not.toBeNull();
    expect(event!.proceedsUsd).toBe(0);
  });

  // Year filter tests
  it("filters by year when yearFilter provided", () => {
    const event = toTaxableEvent(baseSell, 0, 2025);
    expect(event).not.toBeNull(); // 2025-06-15 matches year 2025
  });

  it("returns null when year does not match filter", () => {
    const event = toTaxableEvent(baseSell, 0, 2024);
    expect(event).toBeNull(); // 2025-06-15 does not match year 2024
  });

  it("returns event when no year filter", () => {
    const event = toTaxableEvent(baseSell, 0, undefined);
    expect(event).not.toBeNull();
  });
});
