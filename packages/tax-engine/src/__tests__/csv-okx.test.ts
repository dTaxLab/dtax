/**
 * OKX CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseOkxCsv, isOkxCsv } from "../parsers/okx";
import { parseCsv, detectCsvFormat } from "../parsers";

describe("isOkxCsv", () => {
  it("detects OKX format by header", () => {
    const csv =
      "Order ID,Trade ID,Trade Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency\n";
    expect(isOkxCsv(csv)).toBe(true);
  });

  it("detects OKX format with instrument column", () => {
    const csv =
      "Order ID,Trade ID,Trade Time,Instrument,Side,Price,Amount,Total,Fee,Fee Currency\n";
    expect(isOkxCsv(csv)).toBe(true);
  });

  it("rejects non-OKX format", () => {
    expect(
      isOkxCsv("Timestamp,Transaction Type,Asset,Quantity Transacted"),
    ).toBe(false);
  });
});

describe("detectCsvFormat", () => {
  it("auto-detects OKX", () => {
    const csv =
      "Order ID,Trade ID,Trade Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency\n";
    expect(detectCsvFormat(csv)).toBe("okx");
  });
});

describe("parseOkxCsv", () => {
  const HEADER =
    "Order ID,Trade ID,Trade Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency";

  it("parses a buy trade", () => {
    const csv = `${HEADER}\n1001,2001,2025-01-15 10:30:00,BTC-USDT,buy,50000,1.0,50000,-50,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(1);
    expect(tx.sentAsset).toBe("USDT");
    expect(tx.sentAmount).toBe(50000);
    expect(tx.receivedValueUsd).toBe(50000);
    expect(tx.feeAmount).toBe(50);
    expect(tx.feeAsset).toBe("USDT");
    expect(tx.feeValueUsd).toBe(50);
  });

  it("parses a sell trade", () => {
    const csv = `${HEADER}\n1002,2002,2025-02-20 14:00:00,ETH-USDT,sell,3000,2.0,6000,-6,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.sentAmount).toBe(2);
    expect(tx.receivedAsset).toBe("USDT");
    expect(tx.receivedAmount).toBe(6000);
    expect(tx.sentValueUsd).toBe(6000);
  });

  it("classifies crypto-to-crypto as TRADE", () => {
    const csv = `${HEADER}\n1003,2003,2025-03-01 12:00:00,ETH-BTC,buy,0.05,10.0,0.5,-0.0005,BTC`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBe(10);
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.5);
  });

  it("handles slash separator in pair", () => {
    const csv = `${HEADER}\n1004,2004,2025-04-01 08:00:00,BTC/USDT,buy,60000,0.5,30000,-30,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].sentAsset).toBe("USDT");
  });

  it("handles ISO 8601 timestamp", () => {
    const csv = `${HEADER}\n1005,2005,2025-05-15T09:00:00Z,SOL-USDT,buy,150,10,1500,-1.5,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
  });

  it("handles invalid pair", () => {
    const csv = `${HEADER}\n1006,2006,2025-01-15 10:00:00,INVALID,buy,100,1.0,100,-0.1,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid pair");
  });

  it("handles invalid date", () => {
    const csv = `${HEADER}\n1007,2007,bad_date,BTC-USDT,buy,50000,1.0,50000,-50,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("handles invalid amount", () => {
    const csv = `${HEADER}\n1008,2008,2025-01-15 10:00:00,BTC-USDT,buy,50000,0,0,-50,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid amount");
  });

  it("handles empty CSV", () => {
    const result = parseOkxCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.format).toBe("okx");
  });

  it("sorts by timestamp", () => {
    const csv = `${HEADER}
1009,2009,2025-03-01 12:00:00,BTC-USDT,buy,50000,1.0,50000,-50,USDT
1010,2010,2025-01-01 08:00:00,ETH-USDT,sell,3000,2.0,6000,-6,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe("SELL"); // earlier date
    expect(result.transactions[1].type).toBe("BUY");
  });

  it("handles zero fee", () => {
    const csv = `${HEADER}\n1011,2011,2025-01-15 10:30:00,BTC-USDT,buy,50000,1.0,50000,0,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBeUndefined();
  });

  it("provides correct summary", () => {
    const csv = `${HEADER}
1012,2012,2025-01-15 10:30:00,BTC-USDT,buy,50000,1.0,50000,-50,USDT
1013,2013,2025-01-15 10:35:00,ETH-USDT,sell,3000,2.0,6000,-6,USDT`;
    const result = parseOkxCsv(csv);

    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("okx");
  });

  it("handles USDC as fiat-like quote", () => {
    const csv = `${HEADER}\n1014,2014,2025-05-01 00:00:00,SOL-USDC,buy,150,10.0,1500,-1.5,USDC`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedValueUsd).toBe(1500);
  });

  it("handles fee in non-fiat currency", () => {
    const csv = `${HEADER}\n1015,2015,2025-03-01 12:00:00,ETH-BTC,buy,0.05,10.0,0.5,-0.01,ETH`;
    const result = parseOkxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.feeAmount).toBe(0.01);
    expect(tx.feeAsset).toBe("ETH");
    expect(tx.feeValueUsd).toBeUndefined();
  });

  it("works via unified parseCsv", () => {
    const csv = `${HEADER}\n1016,2016,2025-01-15 10:30:00,BTC-USDT,buy,50000,1.0,50000,-50,USDT`;
    const result = parseCsv(csv);

    expect(result.summary.format).toBe("okx");
    expect(result.transactions).toHaveLength(1);
  });
});
