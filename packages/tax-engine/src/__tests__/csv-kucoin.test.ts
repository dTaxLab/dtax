/**
 * KuCoin CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseKuCoinCsv, isKuCoinCsv } from "../parsers/kucoin";
import { parseCsv, detectCsvFormat } from "../parsers";

describe("isKuCoinCsv", () => {
  it("detects KuCoin format by header", () => {
    const csv =
      "trade_id,symbol,order_type,deal_price,amount,direction,funds,fee_currency,fee,created_at\n";
    expect(isKuCoinCsv(csv)).toBe(true);
  });

  it("rejects non-KuCoin format", () => {
    expect(
      isKuCoinCsv("Timestamp,Transaction Type,Asset,Quantity Transacted"),
    ).toBe(false);
  });
});

describe("detectCsvFormat", () => {
  it("auto-detects KuCoin", () => {
    const csv =
      "trade_id,symbol,order_type,deal_price,amount,direction,funds,fee_currency,fee,created_at\n";
    expect(detectCsvFormat(csv)).toBe("kucoin");
  });
});

describe("parseKuCoinCsv", () => {
  const HEADER =
    "trade_id,symbol,order_type,deal_price,amount,direction,funds,fee_currency,fee,created_at";

  it("parses a buy trade", () => {
    // created_at: 2025-01-15T10:30:00Z in milliseconds
    const ts = new Date("2025-01-15T10:30:00Z").getTime();
    const csv = `${HEADER}\n12345,BTC-USDT,limit,50000,1.0,buy,50000,USDT,50,${ts}`;
    const result = parseKuCoinCsv(csv);

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
    const ts = new Date("2025-02-20T14:00:00Z").getTime();
    const csv = `${HEADER}\n12346,ETH-USDT,market,3000,2.0,sell,6000,USDT,6,${ts}`;
    const result = parseKuCoinCsv(csv);

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
    const ts = new Date("2025-03-01T12:00:00Z").getTime();
    const csv = `${HEADER}\n12347,ETH-BTC,limit,0.05,10.0,buy,0.5,BTC,0.0005,${ts}`;
    const result = parseKuCoinCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.sentAsset).toBe("BTC");
  });

  it("handles date string fallback", () => {
    const header =
      "trade_id,symbol,order_type,deal_price,amount,direction,funds,fee_currency,fee,created_date";
    const csv = `${header}\n12348,BTC-USDT,limit,50000,0.5,buy,25000,USDT,25,2025-04-01 08:00:00`;
    const result = parseKuCoinCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
  });

  it("handles invalid symbol", () => {
    const ts = Date.now();
    const csv = `${HEADER}\n12349,INVALID,limit,100,1.0,buy,100,USDT,0.1,${ts}`;
    const result = parseKuCoinCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid symbol");
  });

  it("handles invalid date", () => {
    const csv = `${HEADER}\n12350,BTC-USDT,limit,50000,1.0,buy,50000,USDT,50,bad_date`;
    const result = parseKuCoinCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("handles empty CSV", () => {
    const result = parseKuCoinCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.format).toBe("kucoin");
  });

  it("sorts by timestamp", () => {
    const ts1 = new Date("2025-03-01T12:00:00Z").getTime();
    const ts2 = new Date("2025-01-01T08:00:00Z").getTime();
    const csv = `${HEADER}
12351,BTC-USDT,limit,50000,1.0,buy,50000,USDT,50,${ts1}
12352,ETH-USDT,limit,3000,2.0,sell,6000,USDT,6,${ts2}`;
    const result = parseKuCoinCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe("SELL"); // earlier date
    expect(result.transactions[1].type).toBe("BUY");
  });

  it("handles zero fee", () => {
    const ts = new Date("2025-01-15T10:30:00Z").getTime();
    const csv = `${HEADER}\n12353,BTC-USDT,limit,50000,1.0,buy,50000,USDT,0,${ts}`;
    const result = parseKuCoinCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBeUndefined();
  });

  it("provides correct summary", () => {
    const ts = new Date("2025-01-15T10:30:00Z").getTime();
    const csv = `${HEADER}
12354,BTC-USDT,limit,50000,1.0,buy,50000,USDT,50,${ts}
12355,ETH-USDT,market,3000,2.0,sell,6000,USDT,6,${ts}`;
    const result = parseKuCoinCsv(csv);

    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("kucoin");
  });

  it("handles USDC as fiat-like quote", () => {
    const ts = new Date("2025-05-01T00:00:00Z").getTime();
    const csv = `${HEADER}\n12356,SOL-USDC,limit,150,10.0,buy,1500,USDC,1.5,${ts}`;
    const result = parseKuCoinCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedValueUsd).toBe(1500);
  });

  it("works via unified parseCsv", () => {
    const ts = new Date("2025-01-15T10:30:00Z").getTime();
    const csv = `${HEADER}\n12357,BTC-USDT,limit,50000,1.0,buy,50000,USDT,50,${ts}`;
    const result = parseCsv(csv);

    expect(result.summary.format).toBe("kucoin");
    expect(result.transactions).toHaveLength(1);
  });
});
