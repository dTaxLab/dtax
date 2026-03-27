/**
 * Upbit CSV Parser Tests
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseUpbitCsv, isUpbitCsv } from "../parsers/upbit";
import { detectCsvFormat, parseCsv } from "../parsers";

const UPBIT_HEADER_KR = "주문일시,마켓,종류,수량,가격,주문금액,수수료,거래금액";

// ─── Detection ─────────────────────────────────────────────────────────────

describe("isUpbitCsv — detection", () => {
  it("detects Korean Upbit headers", () => {
    expect(isUpbitCsv(UPBIT_HEADER_KR + "\n")).toBe(true);
    expect(detectCsvFormat(UPBIT_HEADER_KR + "\n")).toBe("upbit");
  });

  it("rejects Poloniex CSV", () => {
    expect(
      isUpbitCsv(
        "Date,Market,Category,Type,Price,Amount,Total,Fee,Order Number\n",
      ),
    ).toBe(false);
  });

  it("rejects Coinbase CSV", () => {
    expect(isUpbitCsv('"Timestamp","Transaction Type","Asset"\n')).toBe(false);
  });
});

// ─── Buy (KRW market) ───────────────────────────────────────────────────────

describe("parseUpbitCsv — KRW-BTC buy", () => {
  it("parses BTC buy with KRW", () => {
    const csv = `${UPBIT_HEADER_KR}
2024-01-15 10:30:00,KRW-BTC,매수,0.001,55000000,55000,137.5,55137.5`;

    const result = parseUpbitCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);
    expect(result.summary.format).toBe("upbit");

    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBeCloseTo(0.001, 6);
    expect(tx.sentAsset).toBe("KRW");
    expect(tx.feeAmount).toBeCloseTo(137.5, 2);
    expect(tx.feeAsset).toBe("KRW");
  });
});

// ─── Sell (KRW market) ──────────────────────────────────────────────────────

describe("parseUpbitCsv — KRW-ETH sell", () => {
  it("parses ETH sell with KRW", () => {
    const csv = `${UPBIT_HEADER_KR}
2024-02-20 14:00:00,KRW-ETH,매도,0.5,3000000,1500000,3750,1496250`;

    const result = parseUpbitCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.sentAmount).toBeCloseTo(0.5, 6);
    expect(tx.receivedAsset).toBe("KRW");
  });
});

// ─── BTC-XRP (crypto-crypto) ────────────────────────────────────────────────

describe("parseUpbitCsv — BTC-XRP crypto/crypto trade", () => {
  it("parses XRP buy with BTC (TRADE type)", () => {
    const csv = `${UPBIT_HEADER_KR}
2024-03-10 08:00:00,BTC-XRP,매수,1000,0.00002,0.02,0.00005,0.02`;

    const result = parseUpbitCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    // BTC is not fiat → TRADE
    expect(tx.type).toBe("TRADE");
    expect(tx.receivedAsset).toBe("XRP");
    expect(tx.receivedAmount).toBeCloseTo(1000, 0);
    expect(tx.sentAsset).toBe("BTC");
  });
});

// ─── parseCsv auto-detect ───────────────────────────────────────────────────

describe("parseCsv — Upbit auto-detect", () => {
  it("auto-detects and parses Upbit CSV", () => {
    const csv = `${UPBIT_HEADER_KR}
2024-06-01 12:00:00,KRW-BTC,매수,0.005,55000000,275000,687.5,275687.5`;

    const result = parseCsv(csv);
    expect(result.summary.format).toBe("upbit");
    expect(result.transactions).toHaveLength(1);
  });
});
