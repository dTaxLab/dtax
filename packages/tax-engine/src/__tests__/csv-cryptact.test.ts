/**
 * Cryptact CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseCryptactCsv, isCryptactCsv } from "../parsers/cryptact";
import { detectCsvFormat } from "../parsers/index";

const HEADER =
  "Timestamp,Action,Source,Base,Volume,Counter,Price,Fee,FeeCcy,Comment";

describe("isCryptactCsv", () => {
  it("detects Cryptact format by header", () => {
    expect(isCryptactCsv(HEADER + "\n")).toBe(true);
  });

  it("rejects Koinly format (no feeccy)", () => {
    const csv =
      "Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash\n";
    expect(isCryptactCsv(csv)).toBe(false);
  });

  it("rejects Generic format", () => {
    const csv =
      "type,timestamp,receivedAsset,receivedAmount,sentAsset,sentAmount\n";
    expect(isCryptactCsv(csv)).toBe(false);
  });

  it("detects case-insensitively", () => {
    const csv =
      "TIMESTAMP,ACTION,SOURCE,BASE,VOLUME,COUNTER,PRICE,FEE,FEECCY,COMMENT\n";
    expect(isCryptactCsv(csv)).toBe(true);
  });
});

describe("detectCsvFormat — cryptact", () => {
  it("auto-detects cryptact format", () => {
    const csv = `${HEADER}\n2025-01-15 10:30:00,BUY,binance,BTC,0.5,JPY,4500000,1000,JPY,Test`;
    expect(detectCsvFormat(csv)).toBe("cryptact");
  });
});

describe("parseCryptactCsv — action mapping", () => {
  it("BUY action → BUY type with correct fields", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,BUY,binance,BTC,0.5,JPY,4500000,1000,JPY,Test trade`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.5);
    expect(tx.sentAsset).toBe("JPY");
    expect(tx.sentAmount).toBe(0.5 * 4500000);
  });

  it("SELL action → SELL type", () => {
    const csv = `${HEADER}
2025-02-01 14:00:00,SELL,coincheck,ETH,1.0,USDT,3200,5,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.sentAmount).toBe(1.0);
    expect(tx.receivedAsset).toBe("USDT");
    expect(tx.receivedAmount).toBe(3200);
  });

  it("BONUS → AIRDROP", () => {
    const csv = `${HEADER}
2025-04-01 12:00:00,BONUS,airdrop,UNI,100,UNI,0,0,UNI,Governance airdrop`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("AIRDROP");
    expect(result.transactions[0].receivedAsset).toBe("UNI");
    expect(result.transactions[0].receivedAmount).toBe(100);
  });

  it("STAKING → STAKING_REWARD", () => {
    const csv = `${HEADER}
2025-03-01 08:00:00,STAKING,kraken,DOT,10,DOT,0,0,DOT,Staking reward`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("STAKING_REWARD");
    expect(result.transactions[0].receivedAsset).toBe("DOT");
    expect(result.transactions[0].receivedAmount).toBe(10);
  });

  it("LENDING → INTEREST", () => {
    const csv = `${HEADER}
2025-05-01 10:00:00,LENDING,nexo,USDC,50,USDC,0,0,USDC,Interest payment`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("INTEREST");
    expect(result.transactions[0].receivedAsset).toBe("USDC");
  });

  it("LEND → TRANSFER_OUT with lending note", () => {
    const csv = `${HEADER}
2025-05-15 10:00:00,LEND,nexo,USDC,1000,USDC,0,0,USDC,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].sentAsset).toBe("USDC");
    expect(result.transactions[0].sentAmount).toBe(1000);
    expect(result.transactions[0].notes).toContain("lending");
  });

  it("RECOVER → TRANSFER_IN with lending recovery note", () => {
    const csv = `${HEADER}
2025-06-01 10:00:00,RECOVER,nexo,USDC,1000,USDC,0,0,USDC,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].receivedAsset).toBe("USDC");
    expect(result.transactions[0].notes).toContain("lending recovery");
  });

  it("BORROW → TRANSFER_IN with borrow note", () => {
    const csv = `${HEADER}
2025-06-15 10:00:00,BORROW,aave,USDT,5000,USDT,0,0,USDT,DeFi borrow`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].receivedAsset).toBe("USDT");
    expect(result.transactions[0].notes).toContain("borrow");
  });

  it("RETURN → TRANSFER_OUT with loan return note", () => {
    const csv = `${HEADER}
2025-07-01 10:00:00,RETURN,aave,USDT,5000,USDT,0,0,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].sentAsset).toBe("USDT");
    expect(result.transactions[0].notes).toContain("loan return");
  });

  it("SENDFEE → TRANSFER_OUT", () => {
    const csv = `${HEADER}
2025-07-15 10:00:00,SENDFEE,binance,BTC,0.0001,BTC,0,0,BTC,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].sentAsset).toBe("BTC");
    expect(result.transactions[0].sentAmount).toBe(0.0001);
  });

  it("DEFIFEE → TRANSFER_OUT with defi fee note", () => {
    const csv = `${HEADER}
2025-08-01 10:00:00,DEFIFEE,uniswap,ETH,0.005,ETH,0,0,ETH,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].notes).toContain("defi fee");
  });

  it("LOSS → TRANSFER_OUT with loss note", () => {
    const csv = `${HEADER}
2025-08-15 10:00:00,LOSS,unknown,ETH,2.0,ETH,0,0,ETH,Hack loss`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].sentAsset).toBe("ETH");
    expect(result.transactions[0].notes).toContain("loss");
  });

  it("REDUCE → SELL", () => {
    const csv = `${HEADER}
2025-09-01 10:00:00,REDUCE,bybit,BTC,0.1,USDT,45000,10,USDT,Margin reduce`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("SELL");
    expect(result.transactions[0].sentAsset).toBe("BTC");
    expect(result.transactions[0].sentAmount).toBe(0.1);
    expect(result.transactions[0].receivedAsset).toBe("USDT");
    expect(result.transactions[0].receivedAmount).toBe(4500);
  });

  it("SETTLE → TRADE", () => {
    const csv = `${HEADER}
2025-09-15 10:00:00,SETTLE,okx,BTC,0.05,USDT,46000,5,USDT,Futures settlement`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("TRADE");
    expect(result.transactions[0].sentAsset).toBe("BTC");
    expect(result.transactions[0].receivedAsset).toBe("USDT");
    expect(result.transactions[0].receivedAmount).toBe(2300);
  });
});

describe("parseCryptactCsv — field handling", () => {
  it("parses fee amount and asset", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,BUY,binance,BTC,0.5,USDT,45000,25,USDT,`;
    const result = parseCryptactCsv(csv);

    const tx = result.transactions[0];
    expect(tx.feeAsset).toBe("USDT");
    expect(tx.feeAmount).toBe(25);
  });

  it("includes source field in notes", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,BUY,binance,BTC,0.5,USDT,45000,25,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].notes).toContain("source: binance");
  });

  it("includes comment field in notes", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,BUY,binance,BTC,0.5,USDT,45000,25,USDT,My first BTC purchase`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].notes).toContain("My first BTC purchase");
  });

  it("combines source and comment in notes", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,BUY,binance,BTC,0.5,USDT,45000,25,USDT,Big buy`;
    const result = parseCryptactCsv(csv);

    const notes = result.transactions[0].notes || "";
    expect(notes).toContain("source: binance");
    expect(notes).toContain("Big buy");
  });

  it("parses date correctly", () => {
    const csv = `${HEADER}
2025-06-15 10:30:00,BUY,binance,BTC,0.5,USDT,45000,0,USDT,`;
    const result = parseCryptactCsv(csv);

    const ts = result.transactions[0].timestamp;
    expect(ts).toContain("2025-06-15");
    expect(ts).toContain("T");
  });

  it("skips fee when amount is 0", () => {
    const csv = `${HEADER}
2025-03-01 08:00:00,STAKING,kraken,DOT,10,DOT,0,0,DOT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].feeAsset).toBeUndefined();
    expect(result.transactions[0].feeAmount).toBeUndefined();
  });
});

describe("parseCryptactCsv — edge cases", () => {
  it("skips rows with invalid dates", () => {
    const csv = `${HEADER}
bad-date,BUY,binance,BTC,0.5,USDT,45000,25,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("skips rows with missing base/volume", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,BUY,binance,,,USDT,45000,25,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("handles empty CSV", () => {
    const result = parseCryptactCsv("");
    expect(result.transactions).toHaveLength(0);
    expect(result.summary.totalRows).toBe(0);
    expect(result.summary.format).toBe("cryptact");
  });

  it("unknown action → UNKNOWN", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,FOOBAR,test,BTC,1.0,USDT,45000,0,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions[0].type).toBe("UNKNOWN");
    expect(result.transactions[0].notes).toContain("unknown action");
  });

  it("sorts transactions by timestamp", () => {
    const csv = `${HEADER}
2025-03-01 12:00:00,BUY,binance,BTC,0.1,USDT,45000,0,USDT,
2025-01-01 08:00:00,BUY,binance,ETH,1.0,USDT,3000,0,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[1].receivedAsset).toBe("BTC");
  });

  it("provides correct summary", () => {
    const csv = `${HEADER}
2025-01-15 10:30:00,BUY,binance,BTC,0.5,USDT,45000,25,USDT,
2025-02-01 14:00:00,SELL,coincheck,ETH,1.0,USDT,3200,5,USDT,
bad-date,BUY,test,SOL,10,USDT,100,0,USDT,`;
    const result = parseCryptactCsv(csv);

    expect(result.summary.totalRows).toBe(3);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.format).toBe("cryptact");
  });
});
