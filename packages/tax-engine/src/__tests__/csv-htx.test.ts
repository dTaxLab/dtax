/**
 * HTX (Huobi) CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseHtxCsv, isHtxCsv } from "../parsers/htx";
import { parseCsv, detectCsvFormat } from "../parsers";

describe("isHtxCsv", () => {
  it("detects HTX format by header (standard)", () => {
    const csv = "Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency,Role\n";
    expect(isHtxCsv(csv)).toBe(true);
  });

  it("detects HTX format by header (API-style filled-amount)", () => {
    const csv =
      "order-id,symbol,type,price,filled-amount,filled-fees,fee-deduct-currency,role,created-at\n";
    expect(isHtxCsv(csv)).toBe(true);
  });

  it("detects HTX format by fee-deduct-currency", () => {
    const csv = "id,symbol,type,price,amount,fee-deduct-currency,created-at\n";
    expect(isHtxCsv(csv)).toBe(true);
  });

  it("rejects non-HTX format", () => {
    expect(
      isHtxCsv("Timestamp,Transaction Type,Asset,Quantity Transacted"),
    ).toBe(false);
  });

  it("rejects Gate.io format (currency_pair)", () => {
    expect(
      isHtxCsv(
        "No,Currency Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date",
      ),
    ).toBe(false);
  });

  it("rejects MEXC format (Pairs plural)", () => {
    expect(
      isHtxCsv("Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee,Role"),
    ).toBe(false);
  });

  it("rejects Bitget format (Trading Pair)", () => {
    expect(
      isHtxCsv(
        "Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time",
      ),
    ).toBe(false);
  });
});

describe("detectCsvFormat", () => {
  it("auto-detects HTX", () => {
    const csv = "Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency,Role\n";
    expect(detectCsvFormat(csv)).toBe("htx");
  });

  it("auto-detects HTX API format", () => {
    const csv =
      "order-id,symbol,type,price,filled-amount,filled-fees,fee-deduct-currency,role,created-at\n";
    expect(detectCsvFormat(csv)).toBe("htx");
  });
});

describe("parseHtxCsv", () => {
  const HEADER = "Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency,Role";

  it("parses a buy trade", () => {
    const csv = `${HEADER}\n2025-01-15 10:30:00,btcusdt,Buy,50000,1.0,50000,50,USDT,Taker`;
    const result = parseHtxCsv(csv);

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
    const csv = `${HEADER}\n2025-02-20 14:00:00,ethusdt,Sell,3000,2.0,6000,6,USDT,Maker`;
    const result = parseHtxCsv(csv);

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
    const csv = `${HEADER}\n2025-03-01 12:00:00,ethbtc,Buy,0.05,10.0,0.5,0.0005,BTC,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.sentAsset).toBe("BTC");
  });

  it("handles slash-separated symbol", () => {
    const csv = `${HEADER}\n2025-04-01 08:00:00,BTC/USDT,Buy,50000,0.5,25000,25,USDT,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].sentAsset).toBe("USDT");
  });

  it("handles API-style columns with type field", () => {
    const ts = new Date("2025-01-15T10:30:00Z").getTime();
    const csv = `order-id,symbol,type,price,filled-amount,filled-fees,fee-deduct-currency,role,created-at\n1001,btcusdt,buy-limit,50000,1.0,50,USDT,taker,${ts}`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].feeAmount).toBe(50);
    expect(result.transactions[0].feeAsset).toBe("USDT");
  });

  it("handles sell-market type", () => {
    const csv = `order-id,symbol,type,price,filled-amount,filled-fees,fee-deduct-currency,role,created-at\n1002,ethusdt,sell-market,3000,2.0,6,USDT,taker,2025-02-20 14:00:00`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("SELL");
    expect(result.transactions[0].sentAsset).toBe("ETH");
  });

  it("computes total from price * qty when total is missing", () => {
    const header = "Time,Pair,Side,Price,Amount,Fee,Fee Currency";
    const csv = `${header}\n2025-06-01 12:00:00,ethusdt,Buy,3000,2.0,3,USDT`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].sentAmount).toBe(6000);
  });

  it("handles invalid symbol", () => {
    const csv = `${HEADER}\n2025-01-01 00:00:00,X,Buy,100,1.0,100,0.1,USDT,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid symbol");
  });

  it("handles invalid date", () => {
    const csv = `${HEADER}\nbad_date,btcusdt,Buy,50000,1.0,50000,50,USDT,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("handles invalid quantity", () => {
    const csv = `${HEADER}\n2025-01-01 00:00:00,btcusdt,Buy,50000,0,0,50,USDT,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid quantity");
  });

  it("handles missing side", () => {
    const csv =
      "Time,Pair,Price,Amount,Total\n2025-01-01 00:00:00,btcusdt,50000,1.0,50000";
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Missing side");
  });

  it("handles empty CSV", () => {
    const result = parseHtxCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.format).toBe("htx");
  });

  it("sorts by timestamp", () => {
    const csv = `${HEADER}
2025-03-01 12:00:00,btcusdt,Buy,50000,1.0,50000,50,USDT,Taker
2025-01-01 08:00:00,ethusdt,Sell,3000,2.0,6000,6,USDT,Maker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe("SELL");
    expect(result.transactions[1].type).toBe("BUY");
  });

  it("handles zero fee", () => {
    const csv = `${HEADER}\n2025-01-15 10:30:00,btcusdt,Buy,50000,1.0,50000,0,USDT,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBeUndefined();
  });

  it("handles negative fee", () => {
    const csv = `${HEADER}\n2025-01-15 10:30:00,btcusdt,Buy,50000,1.0,50000,-50,USDT,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBe(50);
  });

  it("provides correct summary", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,btcusdt,Buy,50000,1.0,50000,50,USDT,Taker
2025-01-15 10:35:00,ethusdt,Sell,3000,2.0,6000,6,USDT,Maker`;
    const result = parseHtxCsv(csv);

    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("htx");
  });

  it("handles USDC as fiat-like quote", () => {
    const csv = `${HEADER}\n2025-05-01 00:00:00,solusdc,Buy,150,10.0,1500,1.5,USDC,Taker`;
    const result = parseHtxCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedValueUsd).toBe(1500);
  });

  it("works via unified parseCsv", () => {
    const csv = `${HEADER}\n2025-01-15 10:30:00,btcusdt,Buy,50000,1.0,50000,50,USDT,Taker`;
    const result = parseCsv(csv);

    expect(result.summary.format).toBe("htx");
    expect(result.transactions).toHaveLength(1);
  });
});

describe("isHtxCsv — multi-language detection", () => {
  it("should detect Japanese BitTrade headers", () => {
    const csv = "時間,通貨ペア,売／買,価格,数量,約定額,手数料\n";
    expect(isHtxCsv(csv)).toBe(true);
  });

  it("should detect Chinese headers", () => {
    const csv = "时间,交易对,方向,价格,数量,成交额,手续费,手续费币种\n";
    expect(isHtxCsv(csv)).toBe(true);
  });

  it("should not false-positive on Binance Chinese headers", () => {
    // Binance uses 类型 (type), not 方向 (direction)
    const csv = "时间,交易对,类型,价格,数量,成交额,手续费\n";
    expect(isHtxCsv(csv)).toBe(false);
  });
});

describe("parseHtxCsv — Japanese (BitTrade)", () => {
  const csv = `時間,通貨ペア,売／買,価格,数量,約定額,手数料
2024-06-15 10:30:00,BTC/JPY,買,10500000,0.01,105000,52.5
2024-06-16 14:00:00,ETH/JPY,売,550000,1,550000,275
`;

  it("should parse Japanese BitTrade CSV", () => {
    const result = parseHtxCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("htx");
  });

  it("should map Japanese 買/売 to buy/sell", () => {
    const result = parseHtxCsv(csv);
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].sentAsset).toBe("JPY");
    expect(result.transactions[1].sentAsset).toBe("ETH");
    expect(result.transactions[1].receivedAsset).toBe("JPY");
  });
});

describe("parseHtxCsv — Chinese", () => {
  const csv = `时间,交易对,方向,价格,数量,成交额,手续费,手续费币种
2024-07-01 09:00:00,BTC/USDT,买入,65000,0.1,6500,0.0001,BTC
2024-07-02 15:00:00,ETH/USDT,卖出,3500,2,7000,0.002,ETH
`;

  it("should parse Chinese HTX CSV", () => {
    const result = parseHtxCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("should map Chinese 买入/卖出", () => {
    const result = parseHtxCsv(csv);
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[1].sentAsset).toBe("ETH");
  });
});
