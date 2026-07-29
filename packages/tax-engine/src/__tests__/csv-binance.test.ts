/**
 * Binance CSV Parser Unit Tests
 * Tests both Binance International and Binance US formats.
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import {
  parseBinanceCsv,
  parseBinanceUsCsv,
  isBinanceCsv,
  isBinanceUsCsv,
} from "../parsers/binance";
import { detectCsvFormat } from "../parsers/index";

// ─── Binance International (Trade History) ──────────

const BINANCE_TRADE_CSV = `Date(UTC),Pair,Side,Price,Executed,Amount,Fee
2024-01-15 10:30:00,BTCUSDT,BUY,43000,0.5,21500,0.0005
2024-06-01 14:00:00,ETHUSDT,SELL,3500,10,35000,0.01
2024-07-20 08:15:00,SOLUSDT,BUY,150,100,15000,0.1
`;

describe("isBinanceCsv", () => {
  it("should detect Binance International format", () => {
    expect(isBinanceCsv(BINANCE_TRADE_CSV)).toBe(true);
  });

  it("should detect Date (UTC) variant", () => {
    const csv = "Date (UTC),Pair,Side,Price,Executed,Amount,Fee\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should not detect non-Binance format", () => {
    expect(isBinanceCsv("Date,Type,Amount\n")).toBe(false);
  });
});

describe("parseBinanceCsv", () => {
  it("should parse Binance International trade history", () => {
    const result = parseBinanceCsv(BINANCE_TRADE_CSV);

    expect(result.summary.parsed).toBe(3);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.format).toBe("binance");
  });

  it("should correctly map BUY trades", () => {
    const result = parseBinanceCsv(BINANCE_TRADE_CSV);
    const buy = result.transactions[0];

    expect(buy.type).toBe("BUY");
    expect(buy.receivedAsset).toBe("BTC");
    expect(buy.receivedAmount).toBe(0.5);
    expect(buy.sentAsset).toBe("USDT");
    expect(buy.sentAmount).toBe(21500);
    expect(buy.feeAmount).toBe(0.0005);
  });

  it("should correctly map SELL trades", () => {
    const result = parseBinanceCsv(BINANCE_TRADE_CSV);
    const sell = result.transactions[1];

    expect(sell.type).toBe("SELL");
    expect(sell.sentAsset).toBe("ETH");
    expect(sell.sentAmount).toBe(10);
    expect(sell.receivedAsset).toBe("USDT");
    expect(sell.receivedAmount).toBe(35000);
  });

  it("should parse trading pair correctly", () => {
    const result = parseBinanceCsv(BINANCE_TRADE_CSV);
    const sol = result.transactions[2];

    expect(sol.receivedAsset).toBe("SOL");
    expect(sol.sentAsset).toBe("USDT");
  });

  it("should handle pairs with different quote assets", () => {
    const csv = `Date(UTC),Pair,Side,Price,Executed,Amount,Fee
2024-01-15 10:00:00,ETHBTC,BUY,0.05,10,0.5,0.01
`;
    const result = parseBinanceCsv(csv);

    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[0].sentAsset).toBe("BTC");
  });

  it("should report error for invalid pair", () => {
    const csv = `Date(UTC),Pair,Side,Price,Executed,Amount,Fee
2024-01-15 10:00:00,,BUY,100,1,100,0
`;
    const result = parseBinanceCsv(csv);
    expect(result.summary.failed).toBe(1);
    expect(result.errors[0].message).toContain("Cannot parse pair");
  });
});

// ─── Multi-language Binance International Tests ─────

describe("isBinanceCsv — multi-language detection", () => {
  it("should detect Chinese (Simplified) headers", () => {
    const csv =
      "时间,交易对,基准货币,计价货币,类型,价格,数量,成交额,手续费,手续费结算币种\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Chinese (Traditional) headers", () => {
    const csv = "時間,交易對,類型,價格,數量,成交額,手續費\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Japanese headers", () => {
    const csv = "日時,ペア,売買,価格,数量,合計,手数料\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Korean headers", () => {
    const csv = "날짜,거래쌍,유형,가격,수량,총액,수수료\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Turkish headers", () => {
    const csv = "Tarih,İşlem Çifti,Taraf,Fiyat,Miktar,Toplam,Komisyon\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Spanish headers", () => {
    const csv = "Fecha,Par,Lado,Precio,Ejecutado,Monto,Comisión\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Portuguese headers", () => {
    const csv = "Data,Par,Lado,Preço,Executado,Valor,Taxa\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect German headers", () => {
    const csv = "Datum,Paar,Seite,Preis,Ausgeführt,Betrag,Gebühr\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect French headers", () => {
    const csv = "Date,Paire,Côté,Prix,Exécuté,Montant,Frais\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Russian headers", () => {
    const csv = "Дата,Пара,Сторона,Цена,Исполнено,Сумма,Комиссия\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });

  it("should detect Vietnamese headers", () => {
    const csv = "Ngày,Cặp,Phía,Giá,Đã thực hiện,Số tiền,Phí\n";
    expect(isBinanceCsv(csv)).toBe(true);
  });
});

describe("parseBinanceCsv — Chinese (Simplified)", () => {
  const csv = `时间,交易对,基准货币,计价货币,类型,价格,数量,成交额,手续费,手续费结算币种
2026-02-06 13:06:18,SOL/USDT,SOL,USDT,BUY,82.11,0.2,16.422,0.0002,SOL
2026-02-10 09:30:00,BTC/USDT,BTC,USDT,卖出,45000,0.1,4500,0.0001,BTC
`;

  it("should parse Chinese headers correctly", () => {
    const result = parseBinanceCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("should resolve base/quote from explicit columns", () => {
    const result = parseBinanceCsv(csv);
    expect(result.transactions[0].receivedAsset).toBe("SOL");
    expect(result.transactions[0].sentAsset).toBe("USDT");
  });

  it("should map Chinese 卖出 to SELL", () => {
    const result = parseBinanceCsv(csv);
    expect(result.transactions[1].type).toBe("SELL");
    expect(result.transactions[1].sentAsset).toBe("BTC");
  });

  it("should parse fee with Chinese coin column", () => {
    const result = parseBinanceCsv(csv);
    expect(result.transactions[0].feeAmount).toBe(0.0002);
    expect(result.transactions[0].feeAsset).toBe("SOL");
  });
});

describe("parseBinanceCsv — Japanese", () => {
  const csv = `日時,ペア,売買,価格,数量,合計,手数料,手数料通貨
2024-03-15 08:00:00,BTCUSDT,BUY,65000,0.01,650,0.00001,BTC
2024-03-16 12:00:00,ETHUSDT,売却,3200,5,16000,0.005,ETH
`;

  it("should parse Japanese headers", () => {
    const result = parseBinanceCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("should map Japanese 売却 to SELL", () => {
    const result = parseBinanceCsv(csv);
    expect(result.transactions[1].type).toBe("SELL");
  });
});

describe("parseBinanceCsv — Korean", () => {
  const csv = `날짜,거래쌍,유형,가격,수량,총액,수수료,수수료 통화
2024-05-01 10:00:00,BTCUSDT,매수,68000,0.05,3400,0.00005,BTC
2024-05-02 14:00:00,ETHUSDT,매도,3500,2,7000,0.002,ETH
`;

  it("should parse Korean headers", () => {
    const result = parseBinanceCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("should map Korean 매수/매도 to BUY/SELL", () => {
    const result = parseBinanceCsv(csv);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[1].type).toBe("SELL");
  });
});

describe("parseBinanceCsv — Turkish", () => {
  const csv = `Tarih,İşlem Çifti,Taraf,Fiyat,Miktar,Toplam,Komisyon
2024-04-10 09:00:00,BTCUSDT,Aliş,67000,0.02,1340,0.00002
`;

  it("should parse Turkish headers and BUY keyword", () => {
    const result = parseBinanceCsv(csv);
    expect(result.summary.parsed).toBe(1);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
  });
});

describe("parseBinanceCsv — Russian", () => {
  const csv = `Дата,Пара,Сторона,Цена,Исполнено,Сумма,Комиссия
2024-06-01 11:00:00,BTCUSDT,Покупка,70000,0.01,700,0.00001
2024-06-02 15:00:00,ETHUSDT,Продажа,3800,1,3800,0.001
`;

  it("should parse Russian headers and buy/sell keywords", () => {
    const result = parseBinanceCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[1].type).toBe("SELL");
  });
});

// ─── Binance US (Transaction History) ──────────────

const BINANCE_US_CSV = `Date,Type,Asset,Amount,Status,Balance,Fee
2024-01-15 10:30:00,Buy,BTC,0.5,Completed,0.5,0.001
2024-06-01 14:00:00,Sell,ETH,10,Completed,5,0.01
2024-07-15 08:00:00,Staking Rewards,SOL,1.5,Completed,101.5,0
2024-08-01 12:00:00,Withdrawal,BTC,0.1,Completed,0.4,0.0001
`;

describe("isBinanceUsCsv", () => {
  it("should detect Binance US format", () => {
    expect(isBinanceUsCsv(BINANCE_US_CSV)).toBe(true);
  });

  it("should not detect Binance International format", () => {
    expect(isBinanceUsCsv(BINANCE_TRADE_CSV)).toBe(false);
  });
});

describe("parseBinanceUsCsv", () => {
  it("should parse Binance US CSV", () => {
    const result = parseBinanceUsCsv(BINANCE_US_CSV);

    expect(result.summary.parsed).toBe(4);
    expect(result.summary.failed).toBe(0);
  });

  it("should map Buy correctly", () => {
    const result = parseBinanceUsCsv(BINANCE_US_CSV);
    const buy = result.transactions[0];

    expect(buy.type).toBe("BUY");
    expect(buy.receivedAsset).toBe("BTC");
    expect(buy.receivedAmount).toBe(0.5);
    expect(buy.feeAmount).toBe(0.001);
  });

  it("should map Sell correctly", () => {
    const result = parseBinanceUsCsv(BINANCE_US_CSV);
    const sell = result.transactions[1];

    expect(sell.type).toBe("SELL");
    expect(sell.sentAsset).toBe("ETH");
    expect(sell.sentAmount).toBe(10);
  });

  it("should map Staking Rewards correctly", () => {
    const result = parseBinanceUsCsv(BINANCE_US_CSV);
    const reward = result.transactions[2];

    expect(reward.type).toBe("STAKING_REWARD");
    expect(reward.receivedAsset).toBe("SOL");
    expect(reward.receivedAmount).toBe(1.5);
  });

  it("should map Withdrawal to TRANSFER_OUT", () => {
    const result = parseBinanceUsCsv(BINANCE_US_CSV);
    const withdrawal = result.transactions[3];

    expect(withdrawal.type).toBe("TRANSFER_OUT");
    expect(withdrawal.sentAsset).toBe("BTC");
    expect(withdrawal.sentAmount).toBe(0.1);
  });
});

// ─── Binance US (Order/Transaction History — Realized Amount shape) ───
//
// Real customer report (2026-07): a Binance US export with User ID / Time /
// Category / Operation / Primary Asset / Base Asset / Quote Asset / Fee
// Asset columns, each paired with a "Realized Amount ... in USD" column.
// Neither the Binance International parser nor the older Binance US
// "statement" parser recognized this shape — auto-detect fell through to
// "generic" ("No asset found"), and manually selecting Binance US failed
// too ("Invalid date", since this shape uses "Time" not "Date").

const BINANCE_US_REALIZED_CSV = `User ID,Time,Category,Operation,Order ID,Transaction ID,Primary Asset,Realized Amount For Primary Asset,Realized Amount for Primary Asset in USD,Base Asset,Realized Amount For Base Asset,Realized Amount For Base Asset In USD,Quote Asset,Realized Amount for Quote Asset,Realized Amount for Quote Asset in USD,Fee Asset,Realized Amount for Fee Asset,Realized Amount for Fee Asset in USD,Payment Method,Withdraw Method,Additional Note
35011137,2024-03-02T22:06:56,Spot Trading,Sell,78051950,2331787792,,,,ZRX,7,3.022746,USDT,2.9981,2.999916,USDT,0.0119924,0.012,Wallet,,
35011137,2024-03-14T09:15:00,Spot Trading,Buy,78099999,2331999999,,,,BTC,0.01,700,USD,700,700,USD,1.5,1.5,Wallet,,
35011137,2024-04-01T00:00:00,Spot Trading,Deposit,,,BTC,0.25,15000,,,,,,,,,,Wallet,,
`;

describe("isBinanceUsCsv (Realized Amount shape)", () => {
  it("detects the Realized Amount export", () => {
    expect(isBinanceUsCsv(BINANCE_US_REALIZED_CSV)).toBe(true);
  });

  it("auto-detects as binance_us, not generic or binance", () => {
    expect(detectCsvFormat(BINANCE_US_REALIZED_CSV)).toBe("binance_us");
  });
});

describe("parseBinanceUsCsv (Realized Amount shape)", () => {
  it("parses every row with no errors", () => {
    const result = parseBinanceUsCsv(BINANCE_US_REALIZED_CSV);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.parsed).toBe(3);
  });

  it("maps a stablecoin-quoted Sell to TRADE, not SELL — USDT is not fiat", () => {
    const result = parseBinanceUsCsv(BINANCE_US_REALIZED_CSV);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.sentAsset).toBe("ZRX");
    expect(tx.sentAmount).toBe(7);
    expect(tx.sentValueUsd).toBeCloseTo(3.022746, 6);
    expect(tx.receivedAsset).toBe("USDT");
    expect(tx.receivedAmount).toBeCloseTo(2.9981, 6);
    expect(tx.receivedValueUsd).toBeCloseTo(2.999916, 6);
    expect(tx.feeAsset).toBe("USDT");
    expect(tx.feeAmount).toBeCloseTo(0.0119924, 6);
    expect(tx.feeValueUsd).toBeCloseTo(0.012, 6);
  });

  it("maps a USD-quoted Buy to BUY — real fiat", () => {
    const result = parseBinanceUsCsv(BINANCE_US_REALIZED_CSV);
    const tx = result.transactions[1];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.01);
    expect(tx.receivedValueUsd).toBe(700);
    expect(tx.sentAsset).toBe("USD");
    expect(tx.sentValueUsd).toBe(700);
  });

  it("maps a Primary-Asset-only Deposit row to TRANSFER_IN", () => {
    const result = parseBinanceUsCsv(BINANCE_US_REALIZED_CSV);
    const tx = result.transactions[2];
    expect(tx.type).toBe("TRANSFER_IN");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.25);
    expect(tx.receivedValueUsd).toBe(15000);
  });
});
