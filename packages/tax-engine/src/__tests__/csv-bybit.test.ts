/**
 * Bybit CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseBybitCsv, isBybitCsv } from "../parsers/bybit";
import { parseCsv, detectCsvFormat } from "../parsers";

describe("isBybitCsv", () => {
  it("detects Bybit format by header (standard)", () => {
    const csv =
      "Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time,Order Type\n";
    expect(isBybitCsv(csv)).toBe(true);
  });

  it("detects Bybit format by header (API-style)", () => {
    const csv =
      "orderId,symbol,side,execPrice,execQty,execValue,execFee,feeCurrency,execTime\n";
    expect(isBybitCsv(csv)).toBe(true);
  });

  it("rejects non-Bybit format", () => {
    expect(
      isBybitCsv("Timestamp,Transaction Type,Asset,Quantity Transacted"),
    ).toBe(false);
  });
});

describe("detectCsvFormat", () => {
  it("auto-detects Bybit", () => {
    const csv =
      "Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time,Order Type\n";
    expect(detectCsvFormat(csv)).toBe("bybit");
  });
});

describe("parseBybitCsv", () => {
  const HEADER =
    "Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time,Order Type";

  it("parses a buy trade", () => {
    const csv = `${HEADER}\n1001,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-01-15 10:30:00,Limit`;
    const result = parseBybitCsv(csv);

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
    const csv = `${HEADER}\n1002,ETHUSDT,Sell,3000,2.0,6000,6,USDT,2025-02-20 14:00:00,Market`;
    const result = parseBybitCsv(csv);

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
    const csv = `${HEADER}\n1003,ETHBTC,Buy,0.05,10.0,0.5,0.0005,BTC,2025-03-01 12:00:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBe(10);
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.5);
  });

  it("splits concatenated symbols correctly", () => {
    const csv = `${HEADER}\n1004,SOLUSDT,Buy,150,10,1500,1.5,USDT,2025-04-01 08:00:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].receivedAsset).toBe("SOL");
    expect(result.transactions[0].sentAsset).toBe("USDT");
  });

  it("splits USDC quote correctly", () => {
    const csv = `${HEADER}\n1005,BTCUSDC,Buy,60000,0.5,30000,30,USDC,2025-05-01 00:00:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.sentAsset).toBe("USDC");
    expect(tx.receivedValueUsd).toBe(30000);
  });

  it("handles API-style column names", () => {
    const csv =
      "orderId,symbol,side,execPrice,execQty,execValue,execFee,feeCurrency,execTime\n1006,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-01-15 10:30:00";
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
  });

  it("computes total from price * qty when total is missing", () => {
    const header =
      "Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Fee,Fee Currency,Order Time";
    const csv = `${header}\n1007,ETHUSDT,Buy,3000,2.0,3,USDT,2025-06-01 12:00:00`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].sentAmount).toBe(6000);
  });

  it("handles invalid symbol", () => {
    const csv = `${HEADER}\n1008,X,Buy,100,1.0,100,0.1,USDT,2025-01-01 00:00:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid symbol");
  });

  it("handles invalid date", () => {
    const csv = `${HEADER}\n1009,BTCUSDT,Buy,50000,1.0,50000,50,USDT,bad_date,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("handles invalid quantity", () => {
    const csv = `${HEADER}\n1010,BTCUSDT,Buy,50000,0,0,50,USDT,2025-01-01 00:00:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid quantity");
  });

  it("handles empty CSV", () => {
    const result = parseBybitCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.format).toBe("bybit");
  });

  it("sorts by timestamp", () => {
    const csv = `${HEADER}
1011,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-03-01 12:00:00,Limit
1012,ETHUSDT,Sell,3000,2.0,6000,6,USDT,2025-01-01 08:00:00,Market`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe("SELL"); // earlier date
    expect(result.transactions[1].type).toBe("BUY");
  });

  it("handles zero fee", () => {
    const csv = `${HEADER}\n1013,BTCUSDT,Buy,50000,1.0,50000,0,USDT,2025-01-15 10:30:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBeUndefined();
  });

  it("handles fee in non-fiat currency", () => {
    const csv = `${HEADER}\n1014,ETHBTC,Buy,0.05,10.0,0.5,0.01,ETH,2025-03-01 12:00:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.feeAmount).toBe(0.01);
    expect(tx.feeAsset).toBe("ETH");
    expect(tx.feeValueUsd).toBeUndefined();
  });

  it("provides correct summary", () => {
    const csv = `${HEADER}
1015,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-01-15 10:30:00,Limit
1016,ETHUSDT,Sell,3000,2.0,6000,6,USDT,2025-01-15 10:35:00,Market`;
    const result = parseBybitCsv(csv);

    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("bybit");
  });

  it("works via unified parseCsv", () => {
    const csv = `${HEADER}\n1017,BTCUSDT,Buy,50000,1.0,50000,50,USDT,2025-01-15 10:30:00,Limit`;
    const result = parseCsv(csv);

    expect(result.summary.format).toBe("bybit");
    expect(result.transactions).toHaveLength(1);
  });

  it("handles negative fee (Bybit sometimes uses negative values)", () => {
    const csv = `${HEADER}\n1018,BTCUSDT,Buy,50000,1.0,50000,-50,USDT,2025-01-15 10:30:00,Limit`;
    const result = parseBybitCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].feeAmount).toBe(50);
    expect(result.transactions[0].feeAsset).toBe("USDT");
  });
});

// ─── Multi-language Bybit detection tests ──────

describe("isBybitCsv — multi-language detection", () => {
  it("should detect Chinese headers", () => {
    const csv =
      "订单号,交易对,方向,平均成交价,成交数量,总额,手续费,手续费币种,下单时间\n";
    expect(isBybitCsv(csv)).toBe(true);
  });

  it("should detect Japanese headers", () => {
    const csv =
      "注文番号,銘柄,売買,平均約定価格,約定数量,合計,手数料,手数料通貨,注文時間\n";
    expect(isBybitCsv(csv)).toBe(true);
  });

  it("should not false-positive on Binance Chinese", () => {
    const csv =
      "时间,交易对,基准货币,计价货币,类型,价格,数量,成交额,手续费,手续费结算币种\n";
    expect(isBybitCsv(csv)).toBe(false);
  });
});

describe("parseBybitCsv — Chinese", () => {
  const csv = `订单号,交易对,方向,平均成交价,成交数量,总额,手续费,手续费币种,下单时间
1001,BTCUSDT,买入,50000,1.0,50000,50,USDT,2025-01-15 10:30:00
1002,ETHUSDT,卖出,3000,2.0,6000,6,USDT,2025-02-20 14:00:00`;

  it("should parse Chinese headers correctly", () => {
    const result = parseBybitCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("should map Chinese 买入 to BUY", () => {
    const result = parseBybitCsv(csv);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].receivedAmount).toBe(1);
  });

  it("should map Chinese 卖出 to SELL", () => {
    const result = parseBybitCsv(csv);
    expect(result.transactions[1].type).toBe("SELL");
    expect(result.transactions[1].sentAsset).toBe("ETH");
  });
});

describe("parseBybitCsv — Japanese", () => {
  const csv = `注文番号,銘柄,売買,平均約定価格,約定数量,合計,手数料,手数料通貨,注文時間
1001,BTCUSDT,買い,65000,0.5,32500,32.5,USDT,2025-03-15 08:00:00`;

  it("should parse Japanese headers correctly", () => {
    const result = parseBybitCsv(csv);
    expect(result.summary.parsed).toBe(1);
    expect(result.summary.failed).toBe(0);
  });

  it("should map Japanese 買い to BUY", () => {
    const result = parseBybitCsv(csv);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].receivedAmount).toBe(0.5);
  });
});
