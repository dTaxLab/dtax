/**
 * Coinbase CSV Parser Unit Tests
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseCoinbaseCsv, isCoinbaseCsv } from "../parsers/coinbase";

// Real Coinbase header format — with metadata rows before the actual header
const COINBASE_CSV = `You can use this transaction report to inform your likely tax obligations. For US customers, Transactions are reported using the cost basis method the customer has...
Transactions
"Timestamp","Transaction Type","Asset","Quantity Transacted","Spot Price Currency","Spot Price at Transaction","Subtotal","Total (inclusive of fees and/or spread)","Fees and/or Spread","Notes"
"2024-01-15T10:30:00Z","Buy","BTC","0.5","USD","43000","21500","21625","125","Bought 0.5 BTC"
"2024-06-01T14:00:00Z","Sell","BTC","0.3","USD","65000","19500","19425","75","Sold 0.3 BTC"
"2024-07-15T08:00:00Z","Rewards Income","ETH","0.01","USD","3500","35","35","0","Staking reward"
"2024-08-01T12:00:00Z","Send","BTC","0.1","USD","60000","6000","6000","0","Sent to wallet"
`;

const SIMPLE_COINBASE = `"Timestamp","Transaction Type","Asset","Quantity Transacted","Spot Price Currency","Spot Price at Transaction","Subtotal","Total (inclusive of fees and/or spread)","Fees and/or Spread","Notes"
"2024-01-15T10:30:00Z","Buy","BTC","0.5","USD","43000","21500","21625","125","Bought 0.5 BTC"
`;

describe("isCoinbaseCsv", () => {
  it("should detect Coinbase format", () => {
    expect(isCoinbaseCsv(SIMPLE_COINBASE)).toBe(true);
  });

  it("should not detect non-Coinbase format", () => {
    expect(isCoinbaseCsv("Date,Action,Amount\n2024-01-01,BUY,100")).toBe(false);
  });
});

describe("parseCoinbaseCsv", () => {
  it("should parse Coinbase CSV with metadata rows", () => {
    const result = parseCoinbaseCsv(COINBASE_CSV);

    expect(result.summary.format).toBe("coinbase");
    expect(result.summary.parsed).toBe(4);
    expect(result.summary.failed).toBe(0);
  });

  it("should correctly map Buy transactions", () => {
    const result = parseCoinbaseCsv(COINBASE_CSV);
    const buy = result.transactions[0];

    expect(buy.type).toBe("BUY");
    expect(buy.receivedAsset).toBe("BTC");
    expect(buy.receivedAmount).toBe(0.5);
    expect(buy.receivedValueUsd).toBeCloseTo(21625);
    expect(buy.feeValueUsd).toBe(125);
    expect(buy.notes).toBe("Bought 0.5 BTC");
  });

  it("should correctly map Sell transactions", () => {
    const result = parseCoinbaseCsv(COINBASE_CSV);
    const sell = result.transactions[1];

    expect(sell.type).toBe("SELL");
    expect(sell.sentAsset).toBe("BTC");
    expect(sell.sentAmount).toBe(0.3);
    expect(sell.sentValueUsd).toBeCloseTo(19425);
    expect(sell.feeValueUsd).toBe(75);
  });

  it("should correctly map Rewards Income to STAKING_REWARD", () => {
    const result = parseCoinbaseCsv(COINBASE_CSV);
    const reward = result.transactions[2];

    expect(reward.type).toBe("STAKING_REWARD");
    expect(reward.receivedAsset).toBe("ETH");
    expect(reward.receivedAmount).toBe(0.01);
  });

  it("should correctly map Send to TRANSFER_OUT", () => {
    const result = parseCoinbaseCsv(COINBASE_CSV);
    const send = result.transactions[3];

    expect(send.type).toBe("TRANSFER_OUT");
    expect(send.sentAsset).toBe("BTC");
    expect(send.sentAmount).toBe(0.1);
  });

  it("should handle simple CSV without metadata rows", () => {
    const result = parseCoinbaseCsv(SIMPLE_COINBASE);

    expect(result.summary.parsed).toBe(1);
    expect(result.transactions[0].type).toBe("BUY");
  });

  it("should return error if header not found", () => {
    const result = parseCoinbaseCsv("random,data\n1,2\n");

    expect(result.summary.parsed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain(
      "Could not find Coinbase CSV header",
    );
  });
});
