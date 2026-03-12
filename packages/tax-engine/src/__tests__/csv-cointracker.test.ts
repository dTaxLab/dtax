/**
 * CoinTracker CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseCoinTrackerCsv, isCoinTrackerCsv } from "../parsers/cointracker";

const HEADER =
  "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Tag";

describe("isCoinTrackerCsv", () => {
  it("detects CoinTracker format by header", () => {
    expect(isCoinTrackerCsv(HEADER + "\n")).toBe(true);
  });

  it("rejects Koinly format (has net worth amount)", () => {
    const csv =
      "Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash\n";
    expect(isCoinTrackerCsv(csv)).toBe(false);
  });

  it("rejects Generic format", () => {
    const csv =
      "Date,Type,Sent Amount,Sent Currency,Received Amount,Received Currency\n";
    expect(isCoinTrackerCsv(csv)).toBe(false);
  });
});

describe("parseCoinTrackerCsv — type mapping", () => {
  it("BUY: fiat Sent + crypto Received", () => {
    const csv = `${HEADER}
01/15/2025 10:30:00,0.5,ETH,1000,USD,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.sentAsset).toBe("USD");
    expect(tx.sentAmount).toBe(1000);
    expect(tx.receivedAsset).toBe("ETH");
    expect(tx.receivedAmount).toBe(0.5);
  });

  it("SELL: crypto Sent + fiat Received", () => {
    const csv = `${HEADER}
02/01/2025 14:00:00,25000,USD,0.5,BTC,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.receivedAsset).toBe("USD");
  });

  it("TRADE: crypto-to-crypto (both sides, no fiat)", () => {
    const csv = `${HEADER}
03/01/2025 12:00:00,0.05,BTC,1.0,ETH,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.receivedAsset).toBe("BTC");
  });

  it("TRANSFER_IN: only Received, no tag", () => {
    const csv = `${HEADER}
01/10/2025 08:00:00,2.0,ETH,,,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[0].receivedAmount).toBe(2.0);
  });

  it("TRANSFER_OUT: only Sent, no tag", () => {
    const csv = `${HEADER}
01/20/2025 16:00:00,,,1.0,BTC,0.0001,BTC,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].sentAsset).toBe("BTC");
  });

  it("staked tag → STAKING_REWARD", () => {
    const csv = `${HEADER}
04/15/2025 00:00:00,0.01,ETH,,,,,staked`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("STAKING_REWARD");
  });

  it("mined tag → MINING_REWARD", () => {
    const csv = `${HEADER}
05/01/2025 00:00:00,0.001,BTC,,,,,mined`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("MINING_REWARD");
  });

  it("airdrop tag → AIRDROP", () => {
    const csv = `${HEADER}
03/01/2025,500,SOL,,,,,airdrop`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("AIRDROP");
  });

  it("fork tag → AIRDROP", () => {
    const csv = `${HEADER}
08/15/2025 00:00:00,1.0,BCH,,,,,fork`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("AIRDROP");
  });

  it("gift on receive → GIFT_RECEIVED", () => {
    const csv = `${HEADER}
01/15/2025 10:30:00,0.5,BTC,,,,,gift`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("GIFT_RECEIVED");
  });

  it("gift on send → GIFT_SENT", () => {
    const csv = `${HEADER}
01/15/2025 10:30:00,,,0.5,BTC,,,gift`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("GIFT_SENT");
  });

  it("lost → TRANSFER_OUT with notes", () => {
    const csv = `${HEADER}
07/01/2025 00:00:00,,,1.0,ETH,,,lost`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].notes).toContain("lost");
  });

  it("donation → TRANSFER_OUT with notes", () => {
    const csv = `${HEADER}
07/15/2025 00:00:00,,,0.1,BTC,,,donation`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].notes).toContain("donation");
  });

  it("payment with Sent → SELL", () => {
    const csv = `${HEADER}
06/01/2025 00:00:00,,,0.01,BTC,,,payment`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("SELL");
  });

  it("payment with Received → BUY", () => {
    const csv = `${HEADER}
06/15/2025 00:00:00,100,USDC,,,,,payment`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("BUY");
  });

  it("income tag → INTEREST", () => {
    const csv = `${HEADER}
05/15/2025 00:00:00,0.005,BTC,,,,,income`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("INTEREST");
  });
});

describe("parseCoinTrackerCsv — field handling", () => {
  it("parses fee amount and asset", () => {
    const csv = `${HEADER}
01/20/2025 16:00:00,,,1.0,BTC,0.0001,BTC,`;
    const result = parseCoinTrackerCsv(csv);

    const tx = result.transactions[0];
    expect(tx.feeAsset).toBe("BTC");
    expect(tx.feeAmount).toBe(0.0001);
  });

  it("parses MM/DD/YYYY date format with time", () => {
    const csv = `${HEADER}
01/15/2025 10:30:00,0.5,ETH,,,,,`;
    const result = parseCoinTrackerCsv(csv);

    const ts = result.transactions[0].timestamp;
    expect(ts).toContain("2025");
    expect(ts).toContain("T");
    expect(ts).toContain("Z");
  });

  it("parses MM/DD/YYYY date format without time", () => {
    const csv = `${HEADER}
03/01/2025,500,SOL,,,,,`;
    const result = parseCoinTrackerCsv(csv);

    const ts = result.transactions[0].timestamp;
    expect(ts).toContain("2025");
    expect(ts).toContain("T");
    expect(ts).toContain("Z");
  });

  it("stablecoin as fiat (USDT Sent + ETH Received → BUY)", () => {
    const csv = `${HEADER}
01/15/2025 10:30:00,0.5,ETH,1000,USDT,2.5,USDT,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].feeAsset).toBe("USDT");
    expect(result.transactions[0].feeAmount).toBe(2.5);
  });
});

describe("parseCoinTrackerCsv — edge cases", () => {
  it("skips rows with no amounts", () => {
    const csv = `${HEADER}
01/15/2025 10:30:00,,,,,,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("No amount");
  });

  it("skips rows with invalid dates", () => {
    const csv = `${HEADER}
bad-date,1.0,BTC,,,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("handles empty CSV", () => {
    const result = parseCoinTrackerCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.totalRows).toBe(0);
  });

  it("sorts transactions by timestamp", () => {
    const csv = `${HEADER}
03/01/2025 12:00:00,,,1.0,BTC,,,
01/01/2025 08:00:00,2.0,ETH,,,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[1].sentAsset).toBe("BTC");
  });

  it("provides correct summary with mixed valid and invalid rows", () => {
    const csv = `${HEADER}
01/15/2025 10:30:00,1.0,BTC,,,,,
02/01/2025 14:00:00,,,0.5,ETH,,,
bad-date,1.0,SOL,,,,,`;
    const result = parseCoinTrackerCsv(csv);

    expect(result.summary.totalRows).toBe(3);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.format).toBe("cointracker");
  });
});
