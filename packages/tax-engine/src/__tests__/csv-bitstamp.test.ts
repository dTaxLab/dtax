/**
 * Bitstamp CSV Parser Tests
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseBitstampCsv, isBitstampCsv } from "../parsers/bitstamp";
import { detectCsvFormat, parseCsv } from "../parsers";

const BS_HEADER = "Type,Datetime,Account,Amount,Value,Rate,Fee,Sub Type";

// ─── Detection ─────────────────────────────────────────────────────────────

describe("isBitstampCsv — detection", () => {
  it("detects standard Bitstamp headers", () => {
    expect(isBitstampCsv(BS_HEADER + "\n")).toBe(true);
    expect(detectCsvFormat(BS_HEADER + "\n")).toBe("bitstamp");
  });

  it("detects lowercase headers", () => {
    expect(isBitstampCsv(BS_HEADER.toLowerCase() + "\n")).toBe(true);
  });

  it("rejects Poloniex CSV (has 'pair')", () => {
    expect(
      isBitstampCsv(
        "Date,Market,Category,Type,Price,Amount,Total,Fee,Order Number,Base Total Less Fee,Quote Total Less Fee,Fee Currency,Fee Total\n",
      ),
    ).toBe(false);
  });

  it("rejects Coinbase CSV", () => {
    expect(
      isBitstampCsv(
        '"Timestamp","Transaction Type","Asset","Quantity Transacted"\n',
      ),
    ).toBe(false);
  });
});

// ─── Buy Trade ──────────────────────────────────────────────────────────────

describe("parseBitstampCsv — buy", () => {
  it("parses BTC buy", () => {
    const csv = `${BS_HEADER}
Market,2024-01-15 10:30:00,Main Account,0.00100000 BTC,19.08 USD,19080.00,0.05 USD,Buy`;

    const result = parseBitstampCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);
    expect(result.summary.format).toBe("bitstamp");

    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBeCloseTo(0.001, 8);
    expect(tx.sentAsset).toBe("USD");
    expect(tx.sentAmount).toBeCloseTo(19.08, 2);
    expect(tx.receivedValueUsd).toBeCloseTo(19.08, 2);
    expect(tx.feeAmount).toBeCloseTo(0.05, 2);
    expect(tx.feeAsset).toBe("USD");
    expect(tx.feeValueUsd).toBeCloseTo(0.05, 2);
  });
});

// ─── Sell Trade ─────────────────────────────────────────────────────────────

describe("parseBitstampCsv — sell", () => {
  it("parses ETH sell", () => {
    const csv = `${BS_HEADER}
Market,2024-02-20 14:00:00,Main Account,0.50000000 ETH,850.00 USD,1700.00,2.13 USD,Sell`;

    const result = parseBitstampCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.sentAmount).toBeCloseTo(0.5, 6);
    expect(tx.receivedAsset).toBe("USD");
    expect(tx.receivedAmount).toBeCloseTo(850, 2);
    expect(tx.sentValueUsd).toBeCloseTo(850, 2);
  });
});

// ─── Deposit / Withdrawal ───────────────────────────────────────────────────

describe("parseBitstampCsv — deposit/withdrawal", () => {
  it("parses USD deposit", () => {
    const csv = `${BS_HEADER}
Deposit,2024-01-10 09:00:00,Main Account,500.00 USD,,,0.00 USD,`;

    const result = parseBitstampCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    expect(tx.type).toBe("TRANSFER_IN");
    expect(tx.receivedAsset).toBe("USD");
    expect(tx.receivedAmount).toBeCloseTo(500, 2);
  });

  it("parses crypto withdrawal", () => {
    const csv = `${BS_HEADER}
Crypto withdrawal,2024-03-01 08:00:00,Main Account,0.05000000 BTC,,,0.00001 BTC,`;

    const result = parseBitstampCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    expect(tx.type).toBe("TRANSFER_OUT");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBeCloseTo(0.05, 6);
  });
});

// ─── Rewards ────────────────────────────────────────────────────────────────

describe("parseBitstampCsv — rewards", () => {
  it("parses staking reward", () => {
    const csv = `${BS_HEADER}
Staking reward,2024-04-01 00:00:00,Main Account,0.00200000 ETH,,,0.00000000 USD,`;

    const result = parseBitstampCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    expect(tx.type).toBe("STAKING_REWARD");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBeCloseTo(0.002, 6);
  });

  it("parses referral reward as AIRDROP", () => {
    const csv = `${BS_HEADER}
Referral reward,2024-05-01 00:00:00,Main Account,5.00 USD,,,0.00 USD,`;

    const result = parseBitstampCsv(csv);
    const tx = result.transactions[0];
    expect(tx.type).toBe("AIRDROP");
    expect(tx.receivedAsset).toBe("USD");
  });
});

// ─── parseCsv auto-detect ───────────────────────────────────────────────────

describe("parseCsv — Bitstamp auto-detect", () => {
  it("auto-detects and parses bitstamp CSV", () => {
    const csv = `${BS_HEADER}
Market,2024-06-01 12:00:00,Main Account,0.01000000 BTC,200.00 USD,20000.00,0.50 USD,Buy`;

    const result = parseCsv(csv);
    expect(result.summary.format).toBe("bitstamp");
    expect(result.transactions).toHaveLength(1);
  });
});
