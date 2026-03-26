/**
 * Generic CSV Parser Unit Tests
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseGenericCsv } from "../parsers/generic";

describe("parseGenericCsv", () => {
  it("should parse a basic generic CSV", () => {
    const csv = [
      "Type,Timestamp,Received Asset,Received Amount,Received Value USD",
      "BUY,2024-01-15T10:00:00Z,BTC,0.5,$21500",
      "SELL,2024-06-01T12:00:00Z,BTC,0.3,$19500",
    ].join("\n");

    const result = parseGenericCsv(csv);

    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("generic");

    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].receivedAmount).toBe(0.5);
    expect(result.transactions[0].receivedValueUsd).toBeCloseTo(21500);

    expect(result.transactions[1].type).toBe("SELL");
  });

  it("should normalize type aliases", () => {
    const csv = [
      "Type,Timestamp,Received Asset,Received Amount",
      "Purchase,2024-01-01T00:00:00Z,ETH,10",
      "Swap,2024-02-01T00:00:00Z,SOL,100",
      "Deposit,2024-03-01T00:00:00Z,BTC,1",
      "Withdrawal,2024-04-01T00:00:00Z,BTC,0.5",
    ].join("\n");

    const result = parseGenericCsv(csv);

    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[1].type).toBe("TRADE");
    expect(result.transactions[2].type).toBe("TRANSFER_IN");
    expect(result.transactions[3].type).toBe("TRANSFER_OUT");
  });

  it("should handle custom column mapping", () => {
    const csv = [
      "Date,Action,Coin,Qty,USD Value",
      "2024-01-15,BUY,BTC,0.5,21500",
    ].join("\n");

    const result = parseGenericCsv(csv, {
      timestamp: "date",
      type: "action",
      receivedAsset: "coin",
      receivedAmount: "qty",
      receivedValueUsd: "usd value",
    });

    expect(result.summary.parsed).toBe(1);
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].receivedAmount).toBe(0.5);
  });

  it("should report errors for rows with missing timestamp", () => {
    const csv = [
      "Type,Timestamp,Received Asset,Received Amount",
      "BUY,,BTC,0.5",
      "SELL,2024-06-01,BTC,0.3",
    ].join("\n");

    const result = parseGenericCsv(csv);

    expect(result.summary.parsed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Missing timestamp");
  });

  it("should report errors for rows with no asset", () => {
    const csv = ["Type,Timestamp", "BUY,2024-01-15T00:00:00Z"].join("\n");

    const result = parseGenericCsv(csv);

    expect(result.summary.failed).toBe(1);
    expect(result.errors[0].message).toContain("No asset found");
  });

  it("should handle sent side transactions", () => {
    const csv = [
      "Type,Timestamp,Sent Asset,Sent Amount,Sent Value USD,Fee Value USD",
      "SELL,2024-06-01T12:00:00Z,BTC,1.0,60000,25",
    ].join("\n");

    const result = parseGenericCsv(csv);

    expect(result.summary.parsed).toBe(1);
    expect(result.transactions[0].sentAsset).toBe("BTC");
    expect(result.transactions[0].sentAmount).toBe(1.0);
    expect(result.transactions[0].sentValueUsd).toBeCloseTo(60000);
    expect(result.transactions[0].feeValueUsd).toBe(25);
  });

  it("should parse dTax-exported CSV format via column aliases", () => {
    const csv = [
      "Date,Type,Sent Asset,Sent Amount,Sent Value (USD),Received Asset,Received Amount,Received Value (USD),Fee Asset,Fee Amount,Fee Value (USD),Notes",
      "2025-10-11T05:24:20.000Z,BUY,USDT,199.99096,,DOGE,1102,199.99096,DOGE,1.102,,",
      "2025-10-11T08:53:38.000Z,SELL,DOGE,1100,206.514,USDT,206.514,,USDT,0.206514,,",
    ].join("\n");

    const result = parseGenericCsv(csv);

    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);

    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].timestamp).toContain("2025-10-11");
    expect(result.transactions[0].sentAsset).toBe("USDT");
    expect(result.transactions[0].sentAmount).toBeCloseTo(199.99096);
    expect(result.transactions[0].receivedAsset).toBe("DOGE");
    expect(result.transactions[0].receivedAmount).toBe(1102);
    expect(result.transactions[0].receivedValueUsd).toBeCloseTo(199.99096);
    expect(result.transactions[0].feeAsset).toBe("DOGE");
    expect(result.transactions[0].feeAmount).toBeCloseTo(1.102);

    expect(result.transactions[1].type).toBe("SELL");
    expect(result.transactions[1].sentValueUsd).toBeCloseTo(206.514);
  });
});
