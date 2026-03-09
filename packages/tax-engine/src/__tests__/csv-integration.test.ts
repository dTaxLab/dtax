/**
 * CSV Parser Integration Tests (parseCsv unified entry)
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseCsv, detectCsvFormat } from "../parsers";

describe("detectCsvFormat", () => {
  it("should detect Coinbase format", () => {
    const csv =
      '"Timestamp","Transaction Type","Asset","Quantity Transacted","Spot Price Currency","Spot Price at Transaction"\n';
    expect(detectCsvFormat(csv)).toBe("coinbase");
  });

  it("should detect Binance International format", () => {
    const csv = "Date(UTC),Pair,Side,Price,Executed,Amount,Fee\n";
    expect(detectCsvFormat(csv)).toBe("binance");
  });

  it("should detect Binance US format", () => {
    const csv = "Date,Type,Asset,Amount,Status,Balance,Fee\n";
    expect(detectCsvFormat(csv)).toBe("binance_us");
  });

  it("should default to generic", () => {
    const csv = "Date,Type,Amount\n2024-01-01,BUY,100\n";
    expect(detectCsvFormat(csv)).toBe("generic");
  });
});

describe("parseCsv (auto-detect)", () => {
  it("should auto-detect and parse Coinbase CSV", () => {
    const csv = `"Timestamp","Transaction Type","Asset","Quantity Transacted","Spot Price Currency","Spot Price at Transaction","Subtotal","Total (inclusive of fees and/or spread)","Fees and/or Spread","Notes"
"2024-01-15T10:30:00Z","Buy","BTC","0.5","USD","43000","21500","21625","125","Test"
`;
    const result = parseCsv(csv);

    expect(result.summary.format).toBe("coinbase");
    expect(result.summary.parsed).toBe(1);
  });

  it("should fallback to generic for unknown format", () => {
    const csv = [
      "Type,Timestamp,Received Asset,Received Amount",
      "BUY,2024-01-15T00:00:00Z,BTC,0.5",
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.summary.format).toBe("generic");
    expect(result.summary.parsed).toBe(1);
  });

  it("should allow forced format override", () => {
    const csv = [
      "Type,Timestamp,Received Asset,Received Amount",
      "BUY,2024-01-15T00:00:00Z,BTC,0.5",
    ].join("\n");

    const result = parseCsv(csv, { format: "generic" });
    expect(result.summary.format).toBe("generic");
  });
});
