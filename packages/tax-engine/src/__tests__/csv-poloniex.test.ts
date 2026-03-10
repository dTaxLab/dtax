/**
 * Poloniex CSV Parser Tests
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parsePoloniexCsv, isPoloniexCsv } from "../parsers/poloniex";
import { detectCsvFormat, parseCsv } from "../parsers";

const POLO_HEADER =
  "Date,Market,Category,Type,Price,Amount,Total,Fee,Order Number,Base Total Less Fee,Quote Total Less Fee,Fee Currency,Fee Total";

// ─── Detection ────────────────────────────────

describe("isPoloniexCsv — detection", () => {
  it("detects standard Poloniex headers", () => {
    expect(isPoloniexCsv(POLO_HEADER + "\n")).toBe(true);
    expect(detectCsvFormat(POLO_HEADER + "\n")).toBe("poloniex");
  });

  it("detects lowercase headers", () => {
    expect(isPoloniexCsv(POLO_HEADER.toLowerCase() + "\n")).toBe(true);
  });

  it("rejects Coinbase CSV", () => {
    expect(
      isPoloniexCsv(
        '"Timestamp","Transaction Type","Asset","Quantity Transacted"\n',
      ),
    ).toBe(false);
  });

  it("rejects Binance CSV", () => {
    expect(
      isPoloniexCsv("Date(UTC),Pair,Side,Price,Executed,Amount,Fee\n"),
    ).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isPoloniexCsv("")).toBe(false);
  });
});

// ─── Cross-detection ──────────────────────────

describe("Poloniex cross-detection", () => {
  it("does not conflict with OKX", () => {
    const okx =
      "Order ID,Trade ID,Trade Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency\n";
    expect(isPoloniexCsv(okx)).toBe(false);
  });

  it("does not conflict with Bitfinex", () => {
    const bfx = "#,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID\n";
    expect(isPoloniexCsv(bfx)).toBe(false);
  });
});

// ─── Buy Trades ────────────────────────────────

describe("parsePoloniexCsv — buy trades", () => {
  it("parses BTC/USDT buy", () => {
    const csv = `${POLO_HEADER}
2024-01-15 10:30:00,BTC/USDT,Exchange,Buy,43000,0.5,21500,0.00145,12345,0.49928,21500,USDT,31.175`;

    const result = parsePoloniexCsv(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.format).toBe("poloniex");

    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.5);
    expect(tx.receivedValueUsd).toBe(21500);
    expect(tx.sentAsset).toBe("USDT");
    expect(tx.sentAmount).toBe(21500);
    expect(tx.feeAmount).toBe(31.175);
    expect(tx.feeAsset).toBe("USDT");
    expect(tx.feeValueUsd).toBe(31.175);
  });

  it("parses ETH/USD buy", () => {
    const csv = `${POLO_HEADER}
2024-02-20 14:00:00,ETH/USD,Exchange,Buy,2800,10,28000,0.002,67890,9.98,28000,USD,56`;

    const result = parsePoloniexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBe(10);
  });
});

// ─── Sell Trades ───────────────────────────────

describe("parsePoloniexCsv — sell trades", () => {
  it("parses BTC/USDT sell", () => {
    const csv = `${POLO_HEADER}
2024-03-10 09:00:00,BTC/USDT,Exchange,Sell,45000,0.25,11250,0.001,11111,0.25,11238.75,USDT,11.25`;

    const result = parsePoloniexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.25);
    expect(tx.sentValueUsd).toBe(11250);
    expect(tx.receivedAsset).toBe("USDT");
    expect(tx.receivedAmount).toBe(11250);
  });
});

// ─── Crypto-to-Crypto Trades ──────────────────

describe("parsePoloniexCsv — crypto trades", () => {
  it("parses ETH/BTC as TRADE", () => {
    const csv = `${POLO_HEADER}
2024-04-15 16:00:00,ETH/BTC,Exchange,Buy,0.05,5,0.25,0.001,22222,4.995,0.25,BTC,0.00025`;

    const result = parsePoloniexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBe(5);
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.25);
    expect(tx.feeAsset).toBe("BTC");
    expect(tx.feeAmount).toBe(0.00025);
    // BTC is not fiat, so no feeValueUsd
    expect(tx.feeValueUsd).toBeUndefined();
  });

  it("parses SOL/USDC buy as BUY (stablecoin quote)", () => {
    const csv = `${POLO_HEADER}
2024-05-01 10:00:00,SOL/USDC,Exchange,Buy,150,100,15000,0.002,33333,99.8,15000,USDC,30`;

    const result = parsePoloniexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("SOL");
    expect(tx.receivedAmount).toBe(100);
    expect(tx.receivedValueUsd).toBe(15000);
  });
});

// ─── Multiple Trades + Sorting ────────────────

describe("parsePoloniexCsv — multiple trades", () => {
  it("sorts by timestamp", () => {
    const csv = `${POLO_HEADER}
2024-06-15 12:00:00,BTC/USDT,Exchange,Buy,50000,0.1,5000,0.001,1,0.0999,5000,USDT,5
2024-01-10 08:00:00,BTC/USDT,Exchange,Buy,49000,0.2,9800,0.001,2,0.1998,9800,USDT,9.8
2024-03-20 15:00:00,ETH/USDT,Exchange,Sell,3000,1,3000,0.001,3,1,2997,USDT,3`;

    const result = parsePoloniexCsv(csv);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0].timestamp).toContain("2024-01-10");
    expect(result.transactions[1].timestamp).toContain("2024-03-20");
    expect(result.transactions[2].timestamp).toContain("2024-06-15");
  });
});

// ─── Edge Cases ───────────────────────────────

describe("parsePoloniexCsv — edge cases", () => {
  it("handles zero fee", () => {
    const csv = `${POLO_HEADER}
2024-08-01 10:00:00,BTC/USDT,Exchange,Buy,60000,0.01,600,0,1,0.01,600,USDT,0`;

    const result = parsePoloniexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.feeAmount).toBeUndefined();
  });

  it("reports error for invalid date", () => {
    const csv = `${POLO_HEADER}
not-a-date,BTC/USDT,Exchange,Buy,43000,0.5,21500,0.001,1,0.5,21500,USDT,21.5`;

    const result = parsePoloniexCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("reports error for invalid market", () => {
    const csv = `${POLO_HEADER}
2024-01-01 10:00:00,XYZ,Exchange,Buy,100,1,100,0,1,1,100,USD,0`;

    const result = parsePoloniexCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid market");
  });

  it("reports error for unknown type", () => {
    const csv = `${POLO_HEADER}
2024-01-01 10:00:00,BTC/USDT,Exchange,Transfer,43000,0.5,21500,0,1,0.5,21500,USDT,0`;

    const result = parsePoloniexCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Unknown type");
  });

  it("handles empty CSV", () => {
    const csv = POLO_HEADER + "\n";
    const result = parsePoloniexCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("computes total from price * amount when total is missing", () => {
    const csv = `${POLO_HEADER}
2024-01-15 10:00:00,BTC/USDT,Exchange,Buy,50000,0.1,,0.001,1,0.0999,,USDT,5`;

    const result = parsePoloniexCsv(csv);
    const tx = result.transactions[0];
    expect(tx.sentAmount).toBe(5000); // 50000 * 0.1
  });
});

// ─── Integration ──────────────────────────────

describe("Poloniex — parseCsv integration", () => {
  it("auto-detects and parses via parseCsv", () => {
    const csv = `${POLO_HEADER}
2024-01-15 10:30:00,BTC/USDT,Exchange,Buy,43000,0.5,21500,0.001,1,0.5,21500,USDT,21.5`;

    const result = parseCsv(csv);
    expect(result.summary.format).toBe("poloniex");
    expect(result.transactions).toHaveLength(1);
  });

  it("respects format override", () => {
    const csv = `${POLO_HEADER}
2024-01-15 10:30:00,BTC/USDT,Exchange,Buy,43000,0.5,21500,0.001,1,0.5,21500,USDT,21.5`;

    const result = parseCsv(csv, { format: "poloniex" });
    expect(result.summary.format).toBe("poloniex");
  });
});
