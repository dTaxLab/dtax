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
