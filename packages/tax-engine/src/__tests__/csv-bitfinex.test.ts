/**
 * Bitfinex CSV Parser Tests
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseBitfinexCsv, isBitfinexCsv } from "../parsers/bitfinex";
import { detectCsvFormat, parseCsv } from "../parsers";

// ─── Detection ────────────────────────────────

describe("isBitfinexCsv — detection", () => {
  it("detects standard Bitfinex headers", () => {
    const csv = "#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID\n";
    expect(isBitfinexCsv(csv)).toBe(true);
    expect(detectCsvFormat(csv)).toBe("bitfinex");
  });

  it("detects lowercase headers", () => {
    const csv = "#,pair,amount,price,fee,fee currency,date,order id\n";
    expect(isBitfinexCsv(csv)).toBe(true);
  });

  it("rejects Bybit CSV (no 'fee currency' with space)", () => {
    const csv =
      "Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time\n";
    // Bybit also has "Fee Currency" but with capitals, let's test detection order
    // Both might match, but detection order should prioritize correctly
    const format = detectCsvFormat(csv);
    // Bybit should win because it has "filled qty" which is more specific
    expect(format).not.toBe("bitfinex");
  });

  it("rejects Coinbase CSV", () => {
    const csv =
      '"Timestamp","Transaction Type","Asset","Quantity Transacted"\n';
    expect(isBitfinexCsv(csv)).toBe(false);
  });

  it("rejects Binance CSV", () => {
    const csv = "Date(UTC),Pair,Side,Price,Executed,Amount,Fee\n";
    expect(isBitfinexCsv(csv)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isBitfinexCsv("")).toBe(false);
  });
});

// ─── Cross-detection ──────────────────────────

describe("Bitfinex cross-detection", () => {
  it("does not conflict with Kraken", () => {
    const krakenCsv = '"txid","refid","time","type","aclass","asset"\n';
    expect(isBitfinexCsv(krakenCsv)).toBe(false);
  });

  it("does not conflict with OKX", () => {
    const okxCsv =
      "instrument_id,order_id,trade_id,fill_price,fill_size,side,fee\n";
    expect(isBitfinexCsv(okxCsv)).toBe(false);
  });
});

// ─── Buy Trades ────────────────────────────────

describe("parseBitfinexCsv — buy trades", () => {
  it("parses BTC/USD buy", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
123456,BTCUSD,0.5,43000,-10.75,USD,2024-01-15 10:30:00,789012`;

    const result = parseBitfinexCsv(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.format).toBe("bitfinex");

    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.5);
    expect(tx.receivedValueUsd).toBe(21500);
    expect(tx.sentAsset).toBe("USD");
    expect(tx.sentAmount).toBe(21500);
    expect(tx.feeAmount).toBe(10.75);
    expect(tx.feeAsset).toBe("USD");
    expect(tx.feeValueUsd).toBe(10.75);
  });

  it("parses with tBTCUSD symbol prefix", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,tBTCUSD,1.0,50000,-25,USD,2024-06-01 12:00:00,2`;

    const result = parseBitfinexCsv(csv);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(1.0);
  });

  it("parses ETH/USD buy", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
2,ETHUSD,10,2800,-5.6,USD,2024-02-20 14:00:00,3`;

    const result = parseBitfinexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBe(10);
    expect(tx.receivedValueUsd).toBe(28000);
  });
});

// ─── Sell Trades ───────────────────────────────

describe("parseBitfinexCsv — sell trades", () => {
  it("parses BTC/USD sell (negative amount)", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
4,BTCUSD,-0.25,45000,-11.25,USD,2024-03-10 09:00:00,5`;

    const result = parseBitfinexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.25);
    expect(tx.sentValueUsd).toBe(11250);
    expect(tx.receivedAsset).toBe("USD");
    expect(tx.receivedAmount).toBe(11250);
  });
});

// ─── Crypto-to-Crypto Trades ──────────────────

describe("parseBitfinexCsv — crypto trades", () => {
  it("parses ETH/BTC as TRADE", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
6,ETHBTC,5,0.05,-0.001,BTC,2024-04-15 16:00:00,7`;

    const result = parseBitfinexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBe(5);
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.25);
    expect(tx.feeAsset).toBe("BTC");
    expect(tx.feeAmount).toBe(0.001);
  });

  it("parses SOL/USDT buy as BUY (stablecoin quote)", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
8,SOLUSDT,100,150,-3,USDT,2024-05-01 10:00:00,9`;

    const result = parseBitfinexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("SOL");
    expect(tx.receivedAmount).toBe(100);
    expect(tx.receivedValueUsd).toBe(15000);
  });
});

// ─── Colon Separator ──────────────────────────

describe("parseBitfinexCsv — colon separator", () => {
  it("handles BTC:USD pair format", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
10,BTC:USD,0.1,60000,-6,USD,2024-07-01 08:00:00,11`;

    const result = parseBitfinexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.1);
  });
});

// ─── Multiple Trades + Sorting ────────────────

describe("parseBitfinexCsv — multiple trades", () => {
  it("sorts by timestamp", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,BTCUSD,0.1,50000,-5,USD,2024-06-15 12:00:00,100
2,BTCUSD,0.2,49000,-10,USD,2024-01-10 08:00:00,101
3,ETHUSD,1,3000,-3,USD,2024-03-20 15:00:00,102`;

    const result = parseBitfinexCsv(csv);
    expect(result.transactions).toHaveLength(3);
    // Should be sorted: Jan, Mar, Jun
    expect(result.transactions[0].timestamp).toContain("2024-01-10");
    expect(result.transactions[1].timestamp).toContain("2024-03-20");
    expect(result.transactions[2].timestamp).toContain("2024-06-15");
  });
});

// ─── Edge Cases ───────────────────────────────

describe("parseBitfinexCsv — edge cases", () => {
  it("handles zero fee", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,BTCUSD,0.01,60000,0,USD,2024-08-01 10:00:00,1`;

    const result = parseBitfinexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.feeAmount).toBeUndefined();
  });

  it("reports error for invalid date", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,BTCUSD,0.5,43000,-10,USD,not-a-date,1`;

    const result = parseBitfinexCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("reports error for invalid pair", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,X,0.5,100,-1,USD,2024-01-01 10:00:00,1`;

    const result = parseBitfinexCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid pair");
  });

  it("reports error for zero amount", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,BTCUSD,0,50000,-5,USD,2024-01-01 10:00:00,1`;

    const result = parseBitfinexCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid amount");
  });

  it("handles EUR quote as fiat", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,BTCEUR,0.5,40000,-8,EUR,2024-01-15 10:00:00,1`;

    const result = parseBitfinexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.sentAsset).toBe("EUR");
  });

  it("handles empty CSV", () => {
    const csv = "#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID\n";
    const result = parseBitfinexCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── Integration ──────────────────────────────

describe("Bitfinex — parseCsv integration", () => {
  it("auto-detects and parses via parseCsv", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,BTCUSD,0.5,43000,-10,USD,2024-01-15 10:30:00,2`;

    const result = parseCsv(csv);
    expect(result.summary.format).toBe("bitfinex");
    expect(result.transactions).toHaveLength(1);
  });

  it("respects format override", () => {
    const csv = `#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
1,BTCUSD,0.5,43000,-10,USD,2024-01-15 10:30:00,2`;

    const result = parseCsv(csv, { format: "bitfinex" });
    expect(result.summary.format).toBe("bitfinex");
  });
});
