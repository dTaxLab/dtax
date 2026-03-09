/**
 * Tests for Solscan DeFi Activities CSV parser.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import {
  isSolscanDefiCsv,
  parseSolscanDefiCsv,
  isSolscanCsv,
  isSolscanSplCsv,
} from "../parsers/solscan";
import { detectCsvFormat } from "../parsers";

// ─── Detection ────────────────────────────────

describe("isSolscanDefiCsv — detection", () => {
  it("detects standard DeFi activity headers", () => {
    const csv =
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee\n";
    expect(isSolscanDefiCsv(csv)).toBe(true);
  });

  it("detects with 'Action' instead of 'Activity'", () => {
    const csv =
      "Signature,Timestamp,Platform,Action,TokenIn,AmountIn,TokenOut,AmountOut\n";
    expect(isSolscanDefiCsv(csv)).toBe(true);
  });

  it("detects with 'Token In' (spaced) headers", () => {
    const csv =
      "Signature,Timestamp,Platform,Activity,Token In,Amount In,Token Out,Amount Out\n";
    expect(isSolscanDefiCsv(csv)).toBe(true);
  });

  it("detects with 'token_in' (underscore) headers", () => {
    const csv =
      "Signature,Timestamp,Platform,Activity,token_in,amount_in,token_out,amount_out\n";
    expect(isSolscanDefiCsv(csv)).toBe(true);
  });

  it("does not detect SOL transfer CSV", () => {
    const csv = "Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)\n";
    expect(isSolscanDefiCsv(csv)).toBe(false);
  });

  it("does not detect SPL token CSV", () => {
    const csv =
      "Signature,Block,Timestamp,From,To,Amount,TokenAddress,TokenName,TokenSymbol\n";
    expect(isSolscanDefiCsv(csv)).toBe(false);
  });

  it("does not detect Etherscan CSV", () => {
    const csv =
      '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To"\n';
    expect(isSolscanDefiCsv(csv)).toBe(false);
  });
});

// ─── Cross-Detection ─────────────────────────

describe("Solscan DeFi — cross-detection safety", () => {
  it("SOL transfer CSV not detected as DeFi", () => {
    const csv = "Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)\n";
    expect(isSolscanDefiCsv(csv)).toBe(false);
    expect(isSolscanCsv(csv)).toBe(true);
  });

  it("SPL token CSV not detected as DeFi", () => {
    const csv =
      "Signature,Block,Timestamp,From,To,Amount,TokenAddress,TokenName,TokenSymbol\n";
    expect(isSolscanDefiCsv(csv)).toBe(false);
    expect(isSolscanSplCsv(csv)).toBe(true);
  });

  it("DeFi CSV not detected as SOL transfer or SPL", () => {
    const csv =
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee\n";
    expect(isSolscanCsv(csv)).toBe(false);
    expect(isSolscanSplCsv(csv)).toBe(false);
    expect(isSolscanDefiCsv(csv)).toBe(true);
  });

  it("detectCsvFormat returns solscan_defi", () => {
    const csv =
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee\n";
    expect(detectCsvFormat(csv)).toBe("solscan_defi");
  });
});

// ─── Swap Parsing ─────────────────────────────

describe("parseSolscanDefiCsv — swaps", () => {
  it("parses Jupiter SOL→USDC swap", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "abc123def,2024-06-15 12:00:00,Jupiter,Swap,SOL,10,USDC,1500,0.005",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("DEX_SWAP");
    expect(tx.sentAsset).toBe("SOL");
    expect(tx.sentAmount).toBe(10);
    expect(tx.receivedAsset).toBe("USDC");
    expect(tx.receivedAmount).toBe(1500);
    expect(tx.feeAsset).toBe("SOL");
    expect(tx.feeAmount).toBe(0.005);
    expect(tx.notes).toContain("Jupiter");
    expect(tx.notes).toContain("Swap");
  });

  it("parses Raydium swap with 'trade' activity", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "xyz789,2024-06-16 14:30:00,Raydium,Trade,USDC,500,RAY,200,0.001",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("DEX_SWAP");
    expect(result.transactions[0].sentAsset).toBe("USDC");
    expect(result.transactions[0].receivedAsset).toBe("RAY");
  });

  it("parses Orca swap with 'exchange' activity", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "sig456,2024-07-01 09:00:00,Orca,Exchange,SOL,5,BONK,5000000,0.002",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("DEX_SWAP");
  });

  it("classifies unknown platform as DEX_SWAP via known platform fallback", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "sig999,2024-07-02 10:00:00,Lifinity,Unknown Action,SOL,1,USDT,150,0.001",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("DEX_SWAP");
  });
});

// ─── LP Operations ────────────────────────────

describe("parseSolscanDefiCsv — LP operations", () => {
  it("parses add liquidity", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "lp001,2024-06-20 08:00:00,Raydium,Add Liquidity,SOL,10,LP-SOL-USDC,5,0.003",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("LP_DEPOSIT");
    expect(result.transactions[0].sentAsset).toBe("SOL");
    expect(result.transactions[0].receivedAsset).toBe("LP-SOL-USDC");
  });

  it("parses remove liquidity", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "lp002,2024-07-01 10:00:00,Orca,Remove Liquidity,LP-SOL-USDC,5,SOL,10.5,0.002",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("LP_WITHDRAWAL");
  });

  it("parses LP reward / farming reward", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "lp003,2024-07-05 12:00:00,Raydium,LP Reward,,0,RAY,25,0.001",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("LP_REWARD");
    expect(result.transactions[0].receivedAsset).toBe("RAY");
    expect(result.transactions[0].receivedAmount).toBe(25);
    expect(result.transactions[0].sentAsset).toBeUndefined();
  });
});

// ─── Staking ──────────────────────────────────

describe("parseSolscanDefiCsv — staking", () => {
  it("parses stake as WRAP (basis passthrough)", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "stk001,2024-06-25 06:00:00,Marinade,Stake,SOL,100,MSOL,95.5,0.005",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("WRAP");
    expect(result.transactions[0].sentAsset).toBe("SOL");
    expect(result.transactions[0].receivedAsset).toBe("MSOL");
  });

  it("parses unstake as UNWRAP", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "stk002,2024-08-01 12:00:00,Marinade,Unstake,MSOL,95.5,SOL,100.2,0.005",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("UNWRAP");
  });

  it("parses staking reward claim", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "stk003,2024-09-01 00:00:00,Marinade,Claim Reward,,0,MNDE,50,0.001",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("STAKING_REWARD");
  });

  it("classifies unknown activity on Marinade as STAKING_REWARD", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "stk004,2024-09-15 00:00:00,Marinade,Deposit,,0,SOL,0.5,0.001",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("STAKING_REWARD");
  });
});

// ─── Bridge ───────────────────────────────────

describe("parseSolscanDefiCsv — bridge", () => {
  it("parses bridge out", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "brg001,2024-07-10 15:00:00,Wormhole,Bridge Out,SOL,50,,0,0.01",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("BRIDGE_OUT");
    expect(result.transactions[0].sentAsset).toBe("SOL");
    expect(result.transactions[0].sentAmount).toBe(50);
  });

  it("parses bridge in", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "brg002,2024-07-11 10:00:00,Wormhole,Bridge In,,0,WETH,1.5,0.005",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("BRIDGE_IN");
    expect(result.transactions[0].receivedAsset).toBe("WETH");
  });
});

// ─── Edge Cases ───────────────────────────────

describe("parseSolscanDefiCsv — edge cases", () => {
  it("skips rows with no token in/out", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "err001,2024-06-15 12:00:00,Jupiter,Swap,,0,,0,0.001",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Missing token");
  });

  it("handles invalid date gracefully", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "err002,not-a-date,Jupiter,Swap,SOL,10,USDC,1500,0.005",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("handles multiple rows", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "tx1,2024-06-15 12:00:00,Jupiter,Swap,SOL,10,USDC,1500,0.005",
      "tx2,2024-06-16 14:00:00,Raydium,Swap,USDC,500,RAY,200,0.001",
      "tx3,2024-06-17 09:00:00,Marinade,Stake,SOL,100,MSOL,95.5,0.003",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0].type).toBe("DEX_SWAP");
    expect(result.transactions[1].type).toBe("DEX_SWAP");
    expect(result.transactions[2].type).toBe("WRAP");
    expect(result.summary.format).toBe("solscan_defi");
  });

  it("classifies completely unknown activity as UNKNOWN", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "unk001,2024-06-15 12:00:00,UnknownPlatform,SomeNewAction,SOL,1,USDC,150,0.001",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].type).toBe("UNKNOWN");
  });

  it("includes notes with platform, activity, and truncated signature", () => {
    const csv = [
      "Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee",
      "abcdefghij1234567890xyz,2024-06-15 12:00:00,Jupiter,Swap,SOL,10,USDC,1500,0.005",
    ].join("\n");

    const result = parseSolscanDefiCsv(csv);
    expect(result.transactions[0].notes).toBe(
      "Jupiter | Swap | abcdefghij123456...",
    );
  });
});
