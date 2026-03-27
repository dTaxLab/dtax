/**
 * Robinhood CSV Parser Tests
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseRobinhoodCsv, isRobinhoodCsv } from "../parsers/robinhood";
import { detectCsvFormat, parseCsv } from "../parsers";

const RH_HEADER =
  "Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount";

// ─── Detection ─────────────────────────────────────────────────────────────

describe("isRobinhoodCsv — detection", () => {
  it("detects standard Robinhood headers", () => {
    expect(isRobinhoodCsv(RH_HEADER + "\n")).toBe(true);
    expect(detectCsvFormat(RH_HEADER + "\n")).toBe("robinhood");
  });

  it("detects case-insensitive headers", () => {
    expect(isRobinhoodCsv(RH_HEADER.toLowerCase() + "\n")).toBe(true);
  });

  it("rejects Coinbase CSV", () => {
    expect(
      isRobinhoodCsv(
        '"Timestamp","Transaction Type","Asset","Quantity Transacted"\n',
      ),
    ).toBe(false);
  });

  it("rejects Bitstamp CSV", () => {
    expect(
      isRobinhoodCsv("Type,Datetime,Account,Amount,Value,Rate,Fee,Sub Type\n"),
    ).toBe(false);
  });
});

// ─── Buy ────────────────────────────────────────────────────────────────────

describe("parseRobinhoodCsv — buy", () => {
  it("parses BTC buy", () => {
    const csv = `${RH_HEADER}
01/15/2024,01/15/2024,01/15/2024,BTC,Buy Bitcoin,Buy,0.001,42000.00,-42.00`;

    const result = parseRobinhoodCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);
    expect(result.summary.format).toBe("robinhood");

    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBeCloseTo(0.001, 6);
    expect(tx.sentAsset).toBe("USD");
    expect(tx.sentAmount).toBeCloseTo(42, 2);
    expect(tx.receivedValueUsd).toBeCloseTo(42, 2);
  });

  it("parses ETH buy with $-prefixed price", () => {
    const csv = `${RH_HEADER}
03/20/2024,03/20/2024,03/20/2024,ETH,Buy Ethereum,Buy,0.5,$3400.00,-$1700.00`;

    const result = parseRobinhoodCsv(csv);
    expect(result.errors).toHaveLength(0);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBeCloseTo(0.5, 6);
    expect(tx.sentAmount).toBeCloseTo(1700, 2);
  });
});

// ─── Sell ───────────────────────────────────────────────────────────────────

describe("parseRobinhoodCsv — sell", () => {
  it("parses BTC sell", () => {
    const csv = `${RH_HEADER}
02/10/2024,02/10/2024,02/10/2024,BTC,Sell Bitcoin,Sell,0.001,45000.00,45.00`;

    const result = parseRobinhoodCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBeCloseTo(0.001, 6);
    expect(tx.receivedAsset).toBe("USD");
    expect(tx.receivedAmount).toBeCloseTo(45, 2);
    expect(tx.sentValueUsd).toBeCloseTo(45, 2);
  });
});

// ─── Transfer ───────────────────────────────────────────────────────────────

describe("parseRobinhoodCsv — send/receive", () => {
  it("parses crypto send as TRANSFER_OUT", () => {
    const csv = `${RH_HEADER}
05/01/2024,05/01/2024,05/01/2024,ETH,Send Ethereum,Send,1.0,,`;

    const result = parseRobinhoodCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);

    const tx = result.transactions[0];
    expect(tx.type).toBe("TRANSFER_OUT");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.sentAmount).toBeCloseTo(1.0, 6);
  });

  it("parses crypto receive as TRANSFER_IN", () => {
    const csv = `${RH_HEADER}
06/01/2024,06/01/2024,06/01/2024,BTC,Receive Bitcoin,Receive,0.05,,`;

    const result = parseRobinhoodCsv(csv);
    expect(result.errors).toHaveLength(0);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRANSFER_IN");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBeCloseTo(0.05, 6);
  });
});

// ─── CDIV Staking Reward ─────────────────────────────────────────────────────

describe("parseRobinhoodCsv — CDIV staking reward", () => {
  it("parses CDIV as STAKING_REWARD", () => {
    const csv = `${RH_HEADER}
07/01/2024,07/01/2024,07/01/2024,ETH,Crypto Dividend,CDIV,0.001,3500.00,3.50`;

    const result = parseRobinhoodCsv(csv);
    expect(result.errors).toHaveLength(0);
    const tx = result.transactions[0];
    expect(tx.type).toBe("STAKING_REWARD");
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBeCloseTo(0.001, 6);
    expect(tx.receivedValueUsd).toBeCloseTo(3.5, 2);
  });
});

// ─── Skips non-crypto rows ───────────────────────────────────────────────────

describe("parseRobinhoodCsv — skips blank instrument rows", () => {
  it("skips rows with empty instrument (cash transactions)", () => {
    const csv = `${RH_HEADER}
01/01/2024,01/01/2024,01/01/2024,,Cash Sweep,SWEEP,,,100.00
01/15/2024,01/15/2024,01/15/2024,BTC,Buy Bitcoin,Buy,0.001,42000,-42.00`;

    const result = parseRobinhoodCsv(csv);
    // SWEEP is skipped (empty instrument), only BTC buy remains
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].receivedAsset).toBe("BTC");
  });
});

// ─── parseCsv auto-detect ───────────────────────────────────────────────────

describe("parseCsv — Robinhood auto-detect", () => {
  it("auto-detects and parses Robinhood CSV", () => {
    const csv = `${RH_HEADER}
06/01/2024,06/01/2024,06/01/2024,BTC,Buy Bitcoin,Buy,0.01,60000.00,-600.00`;

    const result = parseCsv(csv);
    expect(result.summary.format).toBe("robinhood");
    expect(result.transactions).toHaveLength(1);
  });
});
