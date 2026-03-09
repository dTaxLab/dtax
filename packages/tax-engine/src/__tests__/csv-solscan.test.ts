/**
 * Solscan CSV Parser Tests
 *
 * Tests for SOL transfers and SPL token transfers CSV parsing.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import {
  parseSolscanCsv,
  parseSolscanSplCsv,
  isSolscanCsv,
  isSolscanSplCsv,
} from "../parsers/solscan";
import { parseCsv, detectCsvFormat } from "../parsers";

const USER_ADDR = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

// ─── Detection ───────────────────────────────────────

describe("Solscan detection", () => {
  it("detects SOL transfer CSV", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)
abc123,100,2024-01-15T10:00:00Z,${USER_ADDR},xyz789,1.5,0.000005`;
    expect(isSolscanCsv(csv)).toBe(true);
    expect(detectCsvFormat(csv)).toBe("solscan");
  });

  it("detects SOL transfer with space in column name", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount (SOL),Fee (SOL)
abc123,100,2024-01-15T10:00:00Z,${USER_ADDR},xyz789,1.5,0.000005`;
    expect(isSolscanCsv(csv)).toBe(true);
  });

  it("detects SPL token transfer CSV", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount,TokenAddress,TokenName,TokenSymbol
abc123,100,2024-01-15T10:00:00Z,${USER_ADDR},xyz789,100,mint123,USD Coin,USDC`;
    expect(isSolscanSplCsv(csv)).toBe(true);
    expect(detectCsvFormat(csv)).toBe("solscan");
  });

  it("does not detect Etherscan CSV as Solscan", () => {
    const csv = `"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","Value_IN(ETH)"
"0xabc",123,1705312800,"2024-01-15","0xfrom","0xto","1.5"`;
    expect(isSolscanCsv(csv)).toBe(false);
    expect(isSolscanSplCsv(csv)).toBe(false);
  });

  it("does not detect Etherscan ERC-20 as Solscan SPL", () => {
    const csv = `"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","TokenValue","USDValueDayOfTx","ContractAddress","TokenName","TokenSymbol"
"0xabc",123,1705312800,"2024-01-15","0xfrom","0xto","100","100","0xcontract","USDC","USDC"`;
    expect(isSolscanSplCsv(csv)).toBe(false);
  });
});

// ─── SOL Transfers ───────────────────────────────────

describe("Solscan SOL transfers", () => {
  const solCsv = `Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)
sig1abc,100,2024-01-15T10:00:00Z,${USER_ADDR},xyz789receiver,2.5,0.000005
sig2def,101,2024-01-16T12:00:00Z,sender123addr,${USER_ADDR},1.0,0.000005
sig3ghi,102,2024-01-17T14:00:00Z,other1,other2,0.5,0.000005`;

  it("parses outgoing SOL transfer", () => {
    const result = parseSolscanCsv(solCsv, USER_ADDR);
    expect(result.summary.format).toBe("solscan");
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRANSFER_OUT");
    expect(tx.sentAsset).toBe("SOL");
    expect(tx.sentAmount).toBe(2.5);
    expect(tx.feeAsset).toBe("SOL");
    expect(tx.feeAmount).toBe(0.000005);
  });

  it("parses incoming SOL transfer", () => {
    const result = parseSolscanCsv(solCsv, USER_ADDR);
    const tx = result.transactions[1];
    expect(tx.type).toBe("TRANSFER_IN");
    expect(tx.receivedAsset).toBe("SOL");
    expect(tx.receivedAmount).toBe(1.0);
  });

  it("marks unknown direction when address not matched", () => {
    const result = parseSolscanCsv(solCsv, USER_ADDR);
    // Third row: neither from nor to matches user
    expect(result.transactions).toHaveLength(3);
    const tx = result.transactions[2];
    expect(tx.type).toBe("UNKNOWN");
  });

  it("defaults to TRANSFER_IN when no user address", () => {
    const result = parseSolscanCsv(solCsv, "");
    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].receivedAsset).toBe("SOL");
  });

  it("includes signature in notes (truncated)", () => {
    const result = parseSolscanCsv(solCsv, USER_ADDR);
    expect(result.transactions[0].notes).toContain("sig1abc");
  });

  it("skips zero-amount transfers", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)
sig1,100,2024-01-15T10:00:00Z,${USER_ADDR},xyz789,0,0.000005`;
    const result = parseSolscanCsv(csv, USER_ADDR);
    expect(result.transactions).toHaveLength(0);
  });

  it("handles invalid timestamp", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)
sig1,100,INVALID_DATE,${USER_ADDR},xyz789,1.0,0.000005`;
    const result = parseSolscanCsv(csv, USER_ADDR);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("parses via unified parseCsv with format hint", () => {
    const result = parseCsv(solCsv, {
      format: "solscan",
      userAddress: USER_ADDR,
    });
    expect(result.summary.format).toBe("solscan");
    expect(result.transactions).toHaveLength(3);
  });
});

// ─── SPL Token Transfers ─────────────────────────────

describe("Solscan SPL token transfers", () => {
  const splCsv = `Signature,Block,Timestamp,From,To,Amount,TokenAddress,TokenName,TokenSymbol
sig1abc,100,2024-01-15T10:00:00Z,${USER_ADDR},xyz789,500.25,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,USD Coin,USDC
sig2def,101,2024-02-10T08:30:00Z,sender123,${USER_ADDR},1000,Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB,USDT,USDT
sig3ghi,102,2024-03-05T16:00:00Z,${USER_ADDR},receiver456,0.001,So11111111111111111111111111111111111111112,Wrapped SOL,WSOL`;

  it("parses outgoing SPL transfer", () => {
    const result = parseSolscanSplCsv(splCsv, USER_ADDR);
    expect(result.summary.format).toBe("solscan");
    const tx = result.transactions[0];
    expect(tx.type).toBe("TRANSFER_OUT");
    expect(tx.sentAsset).toBe("USDC");
    expect(tx.sentAmount).toBe(500.25);
  });

  it("parses incoming SPL transfer", () => {
    const result = parseSolscanSplCsv(splCsv, USER_ADDR);
    const tx = result.transactions[1];
    expect(tx.type).toBe("TRANSFER_IN");
    expect(tx.receivedAsset).toBe("USDT");
    expect(tx.receivedAmount).toBe(1000);
  });

  it("handles WSOL token", () => {
    const result = parseSolscanSplCsv(splCsv, USER_ADDR);
    const tx = result.transactions[2];
    expect(tx.sentAsset).toBe("WSOL");
    expect(tx.sentAmount).toBe(0.001);
  });

  it("rejects rows without token symbol", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount,TokenAddress,TokenName,TokenSymbol
sig1,100,2024-01-15T10:00:00Z,${USER_ADDR},xyz789,100,addr,,`;
    const result = parseSolscanSplCsv(csv, USER_ADDR);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Missing token symbol");
  });

  it("uses Token Symbol column with alternate name", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount,Token Address,Token Name,Token Symbol
sig1,100,2024-01-15T10:00:00Z,sender,${USER_ADDR},50,mint123,Raydium,RAY`;
    const result = parseSolscanSplCsv(csv, USER_ADDR);
    expect(result.transactions[0].receivedAsset).toBe("RAY");
  });
});

// ─── Self-Transfer ───────────────────────────────────

describe("Solscan self-transfer", () => {
  it("marks self-transfer as TRANSFER_IN", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)
sig1,100,2024-01-15T10:00:00Z,${USER_ADDR},${USER_ADDR},1.0,0.000005`;
    const result = parseSolscanCsv(csv, USER_ADDR);
    expect(result.transactions[0].type).toBe("TRANSFER_IN");
    expect(result.transactions[0].receivedAsset).toBe("SOL");
  });
});

// ─── Case-Insensitive Address Matching ───────────────

describe("Solscan address matching", () => {
  it("matches addresses case-insensitively", () => {
    const csv = `Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)
sig1,100,2024-01-15T10:00:00Z,${USER_ADDR.toUpperCase()},xyz789,1.0,0.000005`;
    const result = parseSolscanCsv(csv, USER_ADDR.toLowerCase());
    expect(result.transactions[0].type).toBe("TRANSFER_OUT");
  });
});

// ─── Cross-Detection with Other Formats ──────────────

describe("Solscan cross-detection", () => {
  it("does not misdetect Coinbase as Solscan", () => {
    const csv = `Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction
2024-01-15,Buy,BTC,0.5,USD,40000`;
    expect(isSolscanCsv(csv)).toBe(false);
    expect(isSolscanSplCsv(csv)).toBe(false);
  });

  it("does not misdetect Generic as Solscan", () => {
    const csv = `timestamp,type,sent asset,sent amount,received asset,received amount
2024-01-15,BUY,USD,1000,SOL,10`;
    expect(isSolscanCsv(csv)).toBe(false);
  });
});
