/**
 * Koinly CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseKoinlyCsv, isKoinlyCsv } from "../parsers/koinly";

const HEADER =
  "Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash";

describe("isKoinlyCsv", () => {
  it("detects Koinly format by header", () => {
    expect(isKoinlyCsv(HEADER + "\n")).toBe(true);
  });

  it("rejects non-Koinly format (no net worth amount)", () => {
    const csv =
      "Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency\n";
    expect(isKoinlyCsv(csv)).toBe(false);
  });

  it("rejects CoinTracker format", () => {
    const csv =
      "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Tag\n";
    expect(isKoinlyCsv(csv)).toBe(false);
  });
});

describe("parseKoinlyCsv — type mapping", () => {
  it("BUY: fiat Sent + crypto Received", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,1000,USD,0.5,ETH,,,1000,USD,,,`;
    const result = parseKoinlyCsv(csv);

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
2025-02-01 14:00:00,0.5,BTC,25000,USD,,,25000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.receivedAsset).toBe("USD");
  });

  it("TRADE: crypto-to-crypto (both sides, no fiat)", () => {
    const csv = `${HEADER}
2025-03-01 12:00:00,1.0,ETH,0.05,BTC,,,2000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.receivedAsset).toBe("BTC");
  });

  it("TRANSFER_IN: only Received, no label", () => {
    const csv = `${HEADER}
2025-01-10 08:00:00,,,2.0,ETH,,,3000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[0].receivedAmount).toBe(2.0);
  });

  it("TRANSFER_OUT: only Sent, no label", () => {
    const csv = `${HEADER}
2025-01-20 16:00:00,1.0,BTC,,,0.0001,BTC,42000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].sentAsset).toBe("BTC");
  });

  it("airdrop label → AIRDROP", () => {
    const csv = `${HEADER}
2025-04-01 00:00:00,,,100,UNI,,,500,USD,airdrop,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("AIRDROP");
  });

  it("staking label → STAKING_REWARD", () => {
    const csv = `${HEADER}
2025-04-15 00:00:00,,,0.01,ETH,,,20,USD,staking,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("STAKING_REWARD");
  });

  it("reward label → STAKING_REWARD", () => {
    const csv = `${HEADER}
2025-04-15 00:00:00,,,0.01,DOT,,,5,USD,reward,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("STAKING_REWARD");
  });

  it("mining label → MINING_REWARD", () => {
    const csv = `${HEADER}
2025-05-01 00:00:00,,,0.001,BTC,,,50,USD,mining,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("MINING_REWARD");
  });

  it("lending interest label → INTEREST", () => {
    const csv = `${HEADER}
2025-05-15 00:00:00,,,0.005,BTC,,,200,USD,lending interest,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("INTEREST");
  });

  it("income label → INTEREST", () => {
    const csv = `${HEADER}
2025-06-01 00:00:00,,,500,USDC,,,500,USD,income,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("INTEREST");
  });

  it("gift on deposit → GIFT_RECEIVED", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,,,0.5,BTC,,,21000,USD,gift,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("GIFT_RECEIVED");
  });

  it("gift on withdrawal → GIFT_SENT", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,0.5,BTC,,,,,21000,USD,gift,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("GIFT_SENT");
  });

  it("lost → TRANSFER_OUT with notes", () => {
    const csv = `${HEADER}
2025-07-01 00:00:00,1.0,ETH,,,,,2000,USD,lost,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].notes).toContain("lost");
  });

  it("donation → TRANSFER_OUT with notes", () => {
    const csv = `${HEADER}
2025-07-15 00:00:00,0.1,BTC,,,,,5000,USD,donation,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].notes).toContain("donation");
  });

  it("swap → TRADE with notes", () => {
    const csv = `${HEADER}
2025-08-01 00:00:00,1.0,WETH,1.0,ETH,,,2000,USD,swap,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("TRADE");
    expect(result.transactions[0].notes).toContain("tax-free swap (Koinly)");
  });

  it("fork → AIRDROP", () => {
    const csv = `${HEADER}
2025-08-15 00:00:00,,,1.0,BCH,,,300,USD,fork,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("AIRDROP");
  });

  it("stake on deposit → TRANSFER_OUT with staking deposit note", () => {
    const csv = `${HEADER}
2025-09-01 00:00:00,32.0,ETH,,,,,64000,USD,stake,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].notes).toContain("staking deposit");
  });

  it("stake on withdrawal → TRANSFER_IN with staking withdrawal note", () => {
    const csv = `${HEADER}
2025-09-15 00:00:00,,,32.0,ETH,,,64000,USD,stake,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].notes).toContain("staking withdrawal");
  });

  it("realized gain → UNKNOWN", () => {
    const csv = `${HEADER}
2025-10-01 00:00:00,,,500,USDT,,,500,USD,realized gain,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("UNKNOWN");
    expect(result.transactions[0].notes).toContain("manual review");
  });

  it("fee refund → TRANSFER_IN with notes", () => {
    const csv = `${HEADER}
2025-10-15 00:00:00,,,0.001,ETH,,,2,USD,fee refund,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].notes).toContain("fee refund");
  });
});

describe("parseKoinlyCsv — value and field handling", () => {
  it("maps Net Worth USD to receivedValueUsd for deposits", () => {
    const csv = `${HEADER}
2025-01-10 08:00:00,,,2.0,ETH,,,3000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].receivedValueUsd).toBe(3000);
  });

  it("maps Net Worth USD to sentValueUsd for withdrawals", () => {
    const csv = `${HEADER}
2025-01-20 16:00:00,1.0,BTC,,,,,42000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].sentValueUsd).toBe(42000);
  });

  it("maps Net Worth USD to both sides for trades", () => {
    const csv = `${HEADER}
2025-03-01 12:00:00,1.0,ETH,0.05,BTC,,,2000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    const tx = result.transactions[0];
    expect(tx.sentValueUsd).toBe(2000);
    expect(tx.receivedValueUsd).toBe(2000);
  });

  it("parses fee amount and asset", () => {
    const csv = `${HEADER}
2025-01-20 16:00:00,1.0,BTC,,,0.0001,BTC,42000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    const tx = result.transactions[0];
    expect(tx.feeAsset).toBe("BTC");
    expect(tx.feeAmount).toBe(0.0001);
  });

  it("includes TxHash in notes", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,,,1.0,BTC,,,45000,USD,,,0xabcdef123`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].notes).toContain("txhash:0xabcdef123");
  });

  it("includes Description in notes", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,,,1.0,BTC,,,45000,USD,,Bought on exchange,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].notes).toContain("Bought on exchange");
  });

  it("combines description and txhash in notes", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,,,1.0,BTC,,,45000,USD,,Bought on exchange,0xabc`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].notes).toBe(
      "Bought on exchange; txhash:0xabc",
    );
  });

  it("parses date in YYYY-MM-DD HH:mm:ss format", () => {
    const csv = `${HEADER}
2025-06-15 10:30:00,,,1.0,ETH,,,2000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    const ts = result.transactions[0].timestamp;
    expect(ts).toContain("2025-06-15");
    expect(ts).toContain("T");
    expect(ts).toContain("Z");
  });
});

describe("parseKoinlyCsv — edge cases", () => {
  it("skips rows with no amounts gracefully", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,,,,,,,,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("No amount");
  });

  it("skips rows with invalid dates", () => {
    const csv = `${HEADER}
bad-date,,,1.0,BTC,,,45000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("handles empty CSV", () => {
    const result = parseKoinlyCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.totalRows).toBe(0);
  });

  it("sorts transactions by timestamp", () => {
    const csv = `${HEADER}
2025-03-01 12:00:00,1.0,BTC,,,,,42000,USD,,,
2025-01-01 08:00:00,,,2.0,ETH,,,3000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[1].sentAsset).toBe("BTC");
  });

  it("provides correct summary", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,,,1.0,BTC,,,45000,USD,,,
2025-02-01 14:00:00,0.5,ETH,,,,,1000,USD,,,
bad-date,,,1.0,SOL,,,100,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.summary.totalRows).toBe(3);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(1);
  });

  it("does not map Net Worth when currency is not USD", () => {
    const csv = `${HEADER}
2025-01-10 08:00:00,,,2.0,ETH,,,3000,EUR,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].receivedValueUsd).toBeUndefined();
  });

  it("BUY with stablecoin (USDT) on Sent side", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,1000,USDT,0.5,ETH,2.5,USDT,1000,USD,,,`;
    const result = parseKoinlyCsv(csv);

    expect(result.transactions[0].type).toBe("BUY");
  });
});
