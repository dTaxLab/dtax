/**
 * MEXC CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseMexcCsv, isMexcCsv } from "../parsers/mexc";
import { parseCsv, detectCsvFormat } from "../parsers";

describe("isMexcCsv", () => {
  it("detects MEXC format by header (standard)", () => {
    const csv = "Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee,Role\n";
    expect(isMexcCsv(csv)).toBe(true);
  });

  it("detects MEXC format by header (API-style)", () => {
    const csv =
      "symbol,id,orderId,price,qty,quoteQty,commission,commissionAsset,time,isBuyerMaker\n";
    expect(isMexcCsv(csv)).toBe(true);
  });

  it("rejects non-MEXC format", () => {
    expect(
      isMexcCsv("Timestamp,Transaction Type,Asset,Quantity Transacted"),
    ).toBe(false);
  });
});

describe("detectCsvFormat", () => {
  it("auto-detects MEXC", () => {
    const csv = "Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee,Role\n";
    expect(detectCsvFormat(csv)).toBe("mexc");
  });
});

describe("parseMexcCsv", () => {
  const HEADER = "Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee,Role";

  it("parses a buy trade", () => {
    const csv = `${HEADER}\nBTC_USDT,2025-01-15 10:30:00,BUY,50000,1.0,50000,50USDT,Taker`;
    const result = parseMexcCsv(csv);

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
  });

  it("parses a sell trade", () => {
    const csv = `${HEADER}\nETH_USDT,2025-02-20 14:00:00,SELL,3000,2.0,6000,6USDT,Maker`;
    const result = parseMexcCsv(csv);

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
    const csv = `${HEADER}\nETH_BTC,2025-03-01 12:00:00,BUY,0.05,10.0,0.5,0.0005BTC,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.sentAsset).toBe("BTC");
  });

  it("parses concatenated symbol without separator", () => {
    const csv = `${HEADER}\nBTCUSDT,2025-04-01 08:00:00,BUY,50000,0.5,25000,25USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].sentAsset).toBe("USDT");
  });

  it("handles API-style columns with commissionAsset", () => {
    const ts = new Date("2025-01-15T10:30:00Z").getTime();
    const csv = `symbol,id,orderId,price,qty,quoteQty,commission,commissionAsset,time,isBuyerMaker\nBTCUSDT,1001,2001,50000,1.0,50000,50,USDT,${ts},true`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].feeAmount).toBe(50);
    expect(result.transactions[0].feeAsset).toBe("USDT");
  });

  it("handles API-style isBuyerMaker=false as sell", () => {
    const ts = new Date("2025-01-15T10:30:00Z").getTime();
    const csv = `symbol,id,orderId,price,qty,quoteQty,commission,commissionAsset,time,isBuyerMaker\nETHUSDT,1002,2002,3000,2.0,6000,6,USDT,${ts},false`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("SELL");
    expect(result.transactions[0].sentAsset).toBe("ETH");
  });

  it("handles timezone in time header", () => {
    const csv = `Pairs,Time(UTC+08:00),Side,Filled Price,Executed Amount,Total,Fee,Role\nBTC_USDT,2025-01-15 10:30:00,BUY,50000,1.0,50000,50USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
  });

  it("computes total from price * qty when total is missing", () => {
    const header = "Pairs,Time,Side,Filled Price,Executed Amount,Fee,Role";
    const csv = `${header}\nETH_USDT,2025-06-01 12:00:00,BUY,3000,2.0,3USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].sentAmount).toBe(6000);
  });

  it("parses concatenated fee with crypto asset", () => {
    const csv = `${HEADER}\nETH_BTC,2025-03-01 12:00:00,BUY,0.05,10.0,0.5,0.001BTC,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBe(0.001);
    expect(result.transactions[0].feeAsset).toBe("BTC");
  });

  it("handles invalid symbol", () => {
    const csv = `${HEADER}\nX,2025-01-01 00:00:00,BUY,100,1.0,100,0.1USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid symbol");
  });

  it("handles invalid date", () => {
    const csv = `${HEADER}\nBTC_USDT,bad_date,BUY,50000,1.0,50000,50USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("handles invalid quantity", () => {
    const csv = `${HEADER}\nBTC_USDT,2025-01-01 00:00:00,BUY,50000,0,0,50USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid quantity");
  });

  it("handles empty CSV", () => {
    const result = parseMexcCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.format).toBe("mexc");
  });

  it("sorts by timestamp", () => {
    const csv = `${HEADER}
BTC_USDT,2025-03-01 12:00:00,BUY,50000,1.0,50000,50USDT,Taker
ETH_USDT,2025-01-01 08:00:00,SELL,3000,2.0,6000,6USDT,Maker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe("SELL"); // earlier
    expect(result.transactions[1].type).toBe("BUY");
  });

  it("handles zero fee", () => {
    const csv = `${HEADER}\nBTC_USDT,2025-01-15 10:30:00,BUY,50000,1.0,50000,0USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBeUndefined();
  });

  it("handles negative fee", () => {
    const csv = `${HEADER}\nBTC_USDT,2025-01-15 10:30:00,BUY,50000,1.0,50000,-50USDT,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBe(50);
  });

  it("provides correct summary", () => {
    const csv = `${HEADER}
BTC_USDT,2025-01-15 10:30:00,BUY,50000,1.0,50000,50USDT,Taker
ETH_USDT,2025-01-15 10:35:00,SELL,3000,2.0,6000,6USDT,Maker`;
    const result = parseMexcCsv(csv);

    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("mexc");
  });

  it("handles USDC as fiat-like quote", () => {
    const csv = `${HEADER}\nSOL_USDC,2025-05-01 00:00:00,BUY,150,10.0,1500,1.5USDC,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedValueUsd).toBe(1500);
  });

  it("handles fee without amount (empty fee)", () => {
    const csv = `${HEADER}\nBTC_USDT,2025-01-15 10:30:00,BUY,50000,1.0,50000,,Taker`;
    const result = parseMexcCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBeUndefined();
  });

  it("works via unified parseCsv", () => {
    const csv = `${HEADER}\nBTC_USDT,2025-01-15 10:30:00,BUY,50000,1.0,50000,50USDT,Taker`;
    const result = parseCsv(csv);

    expect(result.summary.format).toBe("mexc");
    expect(result.transactions).toHaveLength(1);
  });
});
