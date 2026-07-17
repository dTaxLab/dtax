/**
 * Kraken CSV Parser Tests
 */

import { describe, it, expect } from "vitest";
import {
  parseKrakenCsv,
  isKrakenCsv,
  parseKrakenTradesCsv,
  isKrakenTradesCsv,
} from "../parsers/kraken";
import { detectCsvFormat, parseCsv } from "../parsers";

// ─── Detection ──────────────────────────────────

describe("isKrakenCsv", () => {
  it("detects Kraken ledger format", () => {
    expect(
      isKrakenCsv(
        '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"',
      ),
    ).toBe(true);
  });

  it("rejects non-Kraken CSV", () => {
    expect(isKrakenCsv("Date,Type,Asset,Amount")).toBe(false);
  });

  it("integrates with detectCsvFormat", () => {
    const csv =
      '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"\n';
    expect(detectCsvFormat(csv)).toBe("kraken");
  });
});

// ─── Parsing ────────────────────────────────────

describe("parseKrakenCsv", () => {
  const header =
    '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"';

  it("parses a deposit", () => {
    const csv = [
      header,
      '"L1","R1","2025-01-10 08:30:00","deposit","","currency","XXBT","0.5","0.0000","0.5"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].receivedAsset).toBe("BTC");
    expect(result.transactions[0].receivedAmount).toBe(0.5);
    expect(result.summary.format).toBe("kraken");
  });

  it("parses a withdrawal", () => {
    const csv = [
      header,
      '"L2","R2","2025-02-15 12:00:00","withdrawal","","currency","XETH","-2.0","0.005","0.0"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[0].sentAsset).toBe("ETH");
    expect(result.transactions[0].sentAmount).toBe(2.0);
    expect(result.transactions[0].feeAmount).toBe(0.005);
    expect(result.transactions[0].feeAsset).toBe("ETH");
  });

  it("parses a staking reward", () => {
    const csv = [
      header,
      '"L3","R3","2025-03-01 00:00:00","staking","","currency","XETH","0.01","0.0","10.01"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("STAKING_REWARD");
    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[0].receivedAmount).toBe(0.01);
  });

  it("pairs trade entries by refid", () => {
    const csv = [
      header,
      '"L4","TRADE-1","2025-04-01 10:00:00","trade","","currency","ZUSD","-50000.00","10.00","0.0"',
      '"L5","TRADE-1","2025-04-01 10:00:00","trade","","currency","XXBT","1.0","0.0000","1.5"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.sentAsset).toBe("USD");
    expect(tx.sentAmount).toBe(50000);
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(1.0);
    expect(tx.receivedValueUsd).toBe(50000);
    expect(tx.feeAmount).toBe(10);
  });

  it("parses a sell trade (crypto → fiat)", () => {
    const csv = [
      header,
      '"L6","TRADE-2","2025-05-01 14:00:00","trade","","currency","XXBT","-0.5","0.0000","0.5"',
      '"L7","TRADE-2","2025-05-01 14:00:00","trade","","currency","ZUSD","25000.00","5.00","25000.0"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.5);
    expect(tx.receivedAsset).toBe("USD");
    expect(tx.receivedAmount).toBe(25000);
    expect(tx.sentValueUsd).toBe(25000);
  });

  it("parses a crypto-to-crypto trade", () => {
    const csv = [
      header,
      '"L8","TRADE-3","2025-06-01 09:00:00","trade","","currency","XETH","-10.0","0.01","0.0"',
      '"L9","TRADE-3","2025-06-01 09:00:00","trade","","currency","XXBT","0.5","0.0000","2.0"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.sentAmount).toBe(10);
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.5);
  });

  it("normalizes Kraken asset codes", () => {
    const csv = [
      header,
      '"L10","R10","2025-01-01 00:00:00","deposit","","currency","XXRP","1000","0.0","1000"',
      '"L11","R11","2025-01-02 00:00:00","deposit","","currency","XXLM","500","0.0","500"',
      '"L12","R12","2025-01-03 00:00:00","deposit","","currency","XXDG","10000","0.0","10000"',
      '"L13","R13","2025-01-04 00:00:00","deposit","","currency","DOT","25","0.0","25"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(4);
    expect(result.transactions[0].receivedAsset).toBe("XRP");
    expect(result.transactions[1].receivedAsset).toBe("XLM");
    expect(result.transactions[2].receivedAsset).toBe("DOGE");
    expect(result.transactions[3].receivedAsset).toBe("DOT");
  });

  it("handles staking transfer subtypes", () => {
    const csv = [
      header,
      '"L14","R14","2025-03-01 00:00:00","transfer","stakingfromspot","currency","XETH","-5.0","0.0","5.0"',
      '"L15","R15","2025-03-01 00:00:00","transfer","stakingtospot","currency","XETH","5.0","0.0","10.0"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
    expect(result.transactions[1].type).toBe("TRANSFER_IN");
  });

  it("classifies Earn 'reward' as INTEREST but 'autoallocation' as an internal transfer, not income", () => {
    // Real-world shape (Kraken "spot ledgers" export): a reward payout, then
    // Kraken auto-moving that same balance from spot to the earn wallet.
    // Before the fix both legs were INTEREST — double-counting the payout
    // as income a second time when it was just moved between own wallets.
    const csv = [
      header,
      '"L30","R30","2025-08-24 17:03:57","earn","reward","currency","BTC","0.0000294667","0","0.0000294667"',
      '"L31","R31","2025-08-24 17:03:58","earn","autoallocation","currency","BTC","-0.0000294667","0","0.0000000000"',
      '"L32","R32","2025-08-24 17:03:58","earn","autoallocation","currency","BTC","0.0000294667","0","0.0000294667"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0].type).toBe("INTEREST");
    expect(result.transactions[1].type).toBe("TRANSFER_OUT");
    expect(result.transactions[2].type).toBe("TRANSFER_IN");
  });

  it("handles invalid dates gracefully", () => {
    const csv = [
      header,
      '"L16","R16","not-a-date","deposit","","currency","XXBT","1.0","0.0","1.0"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("handles missing asset gracefully", () => {
    const csv = [
      header,
      '"L17","R17","2025-01-01 00:00:00","deposit","","currency","","1.0","0.0","1.0"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("integrates with parseCsv auto-detection", () => {
    const csv = [
      header,
      '"L18","R18","2025-01-10 08:30:00","deposit","","currency","XXBT","0.5","0.0","0.5"',
    ].join("\n");

    const result = parseCsv(csv);
    expect(result.summary.format).toBe("kraken");
    expect(result.transactions).toHaveLength(1);
  });

  it("sorts transactions by timestamp", () => {
    const csv = [
      header,
      '"L19","R19","2025-03-01 00:00:00","deposit","","currency","XXBT","1.0","0.0","1.0"',
      '"L20","R20","2025-01-01 00:00:00","deposit","","currency","XETH","2.0","0.0","2.0"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].receivedAsset).toBe("ETH");
    expect(result.transactions[1].receivedAsset).toBe("BTC");
  });

  it("handles mixed ledger with trades and deposits", () => {
    const csv = [
      header,
      '"L21","R21","2025-01-01 00:00:00","deposit","","currency","ZUSD","10000","0.0","10000"',
      '"L22","TRADE-4","2025-01-02 10:00:00","trade","","currency","ZUSD","-5000","2.5","5000"',
      '"L23","TRADE-4","2025-01-02 10:00:00","trade","","currency","XXBT","0.1","0.0","0.1"',
      '"L24","R24","2025-01-03 00:00:00","staking","","currency","XETH","0.005","0.0","0.005"',
    ].join("\n");

    const result = parseKrakenCsv(csv);
    expect(result.transactions).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    // Sorted by timestamp
    expect(result.transactions[0].type).toBe("TRANSFER_IN"); // deposit USD
    expect(result.transactions[1].type).toBe("BUY"); // paired trade
    expect(result.transactions[2].type).toBe("STAKING_REWARD"); // staking
  });
});

// ─── Trades format (one row per order fill) ────────────────────────

describe("isKrakenTradesCsv", () => {
  it("detects Kraken Trades format", () => {
    expect(
      isKrakenTradesCsv(
        '"txid","ordertxid","pair","aclass","subclass","time","type","ordertype","price","cost","fee","vol","margin","misc","ledgers"',
      ),
    ).toBe(true);
  });

  it("rejects the Ledger format (has refid/asset, not ordertxid/pair/vol)", () => {
    expect(
      isKrakenTradesCsv(
        '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"',
      ),
    ).toBe(false);
  });

  it("integrates with detectCsvFormat", () => {
    const csv =
      '"txid","ordertxid","pair","aclass","subclass","time","type","ordertype","price","cost","fee","vol","margin","misc","ledgers"\n';
    expect(detectCsvFormat(csv)).toBe("kraken_trades");
  });
});

describe("parseKrakenTradesCsv", () => {
  const tradesHeader =
    '"txid","ordertxid","pair","aclass","subclass","time","type","ordertype","price","cost","fee","vol","margin","misc","ledgers","posttxid","posstatuscode","cprice","ccost","cfee","cvol","cmargin","net","costusd","trades"';

  it("parses a real-shaped sell fill (BTC/USD)", () => {
    const csv = [
      tradesHeader,
      '"THRLBT-NPJIN-YHAPVW","O22I65-AIQM2-NLFWMH","BTC/USD","forex","crypto","2025-07-18 23:56:31.1534","sell","limit",118013.09995,22184.28781,88.73716,0.18798157,0.00000,"initiated","LMK3R6-JVEKI-LYSVOO,L7PRXT-UIPGO-NZ5YWD","TKH2SE-M7IF5-CFI7LT","","","","","","","",22184.28781,""',
    ].join("\n");

    const result = parseKrakenTradesCsv(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    const tx = result.transactions[0];
    expect(tx.type).toBe("SELL");
    expect(tx.sentAsset).toBe("BTC");
    expect(tx.sentAmount).toBe(0.18798157);
    expect(tx.receivedAsset).toBe("USD");
    expect(tx.receivedAmount).toBe(22184.28781);
    expect(tx.receivedValueUsd).toBe(22184.28781);
    expect(tx.feeAmount).toBe(88.73716);
    expect(tx.feeAsset).toBe("USD");
  });

  it("parses a buy fill (BTC/USD)", () => {
    const csv = [
      tradesHeader,
      '"TBUY001","OBUY001","BTC/USD","forex","crypto","2025-03-01 10:00:00.0000","buy","market",50000.00,5000.00,10.00,0.1,0.00000,"","","","","","","","","","",5000.00,""',
    ].join("\n");

    const result = parseKrakenTradesCsv(csv);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("BUY");
    expect(tx.sentAsset).toBe("USD");
    expect(tx.sentAmount).toBe(5000);
    expect(tx.sentValueUsd).toBe(5000);
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedAmount).toBe(0.1);
    expect(tx.feeAmount).toBe(10);
  });

  it("classifies a non-fiat-quote pair as TRADE, not BUY/SELL", () => {
    const csv = [
      tradesHeader,
      '"TCRYPTO1","OCRYPTO1","ETH/BTC","forex","crypto","2025-03-01 10:00:00.0000","sell","market",0.05,1.0,0.002,20,0.00000,"","","","","","","","","","",0,""',
    ].join("\n");

    const result = parseKrakenTradesCsv(csv);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRADE");
    expect(tx.sentAsset).toBe("ETH");
    expect(tx.receivedAsset).toBe("BTC");
    expect(tx.receivedValueUsd).toBeUndefined();
  });

  it("handles invalid dates gracefully", () => {
    const csv = [
      tradesHeader,
      '"TBAD1","OBAD1","BTC/USD","forex","crypto","not-a-date","sell","limit",50000,5000,10,0.1,0,"","","","","","","","","","",5000,""',
    ].join("\n");

    const result = parseKrakenTradesCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("handles an unrecognized pair gracefully", () => {
    const csv = [
      tradesHeader,
      '"TBAD2","OBAD2","???","forex","crypto","2025-03-01 10:00:00.0000","sell","limit",50000,5000,10,0.1,0,"","","","","","","","","","",5000,""',
    ].join("\n");

    const result = parseKrakenTradesCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Unrecognized trading pair");
  });

  it("integrates with parseCsv auto-detection and does not misfire against the Ledger format", () => {
    const csv = [
      tradesHeader,
      '"TAUTO1","OAUTO1","BTC/USD","forex","crypto","2025-03-01 10:00:00.0000","sell","limit",50000,5000,10,0.1,0,"","","","","","","","","","",5000,""',
    ].join("\n");

    const result = parseCsv(csv);
    expect(result.summary.format).toBe("kraken_trades");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].type).toBe("SELL");
  });

  it("sorts fills by timestamp", () => {
    const csv = [
      tradesHeader,
      '"T2","O2","BTC/USD","forex","crypto","2025-03-02 00:00:00.0000","sell","limit",50000,5000,10,0.1,0,"","","","","","","","","","",5000,""',
      '"T1","O1","BTC/USD","forex","crypto","2025-03-01 00:00:00.0000","sell","limit",49000,4900,10,0.1,0,"","","","","","","","","","",4900,""',
    ].join("\n");

    const result = parseKrakenTradesCsv(csv);
    expect(result.transactions).toHaveLength(2);
    expect(
      result.transactions[0].timestamp < result.transactions[1].timestamp,
    ).toBe(true);
  });
});
