/**
 * Solscan CSV Format Parser
 *
 * Handles CSV exports from Solscan.io (Solana blockchain explorer).
 * Supports three export formats:
 *
 * 1. SOL Transfers — native SOL transfer history
 *    Columns: Signature, Block, Timestamp, From, To, Amount(SOL), Fee(SOL)
 *
 * 2. SPL Token Transfers — SPL token transfer history
 *    Columns: Signature, Block, Timestamp, From, To, Amount, TokenAddress, TokenName, TokenSymbol
 *
 * 3. DeFi Activities — swap, LP, staking from Solscan DeFi tab
 *    Columns: Signature, Timestamp, Platform, Activity, TokenIn, AmountIn, TokenOut, AmountOut, Fee
 *
 * Requires `userAddress` to determine transfer direction (in/out).
 * Similar to Etherscan parser pattern.
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/**
 * Detect if a CSV is a Solscan SOL transfers export.
 * Key indicator: "Signature" column + "Amount(SOL)" or "Amount (SOL)" or "SOL" in headers.
 */
export function isSolscanCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("signature") &&
    (firstLine.includes("amount(sol)") ||
      firstLine.includes("amount (sol)") ||
      firstLine.includes("fee(sol)") ||
      firstLine.includes("fee (sol)")) &&
    !firstLine.includes("txhash") // Exclude Etherscan
  );
}

/**
 * Detect if a CSV is a Solscan SPL token transfers export.
 * Key indicator: "Signature" + "TokenSymbol" or "Token Symbol" or "TokenAddress".
 */
export function isSolscanSplCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("signature") &&
    (firstLine.includes("tokensymbol") ||
      firstLine.includes("token symbol") ||
      firstLine.includes("tokenaddress") ||
      firstLine.includes("token address")) &&
    !firstLine.includes("txhash") // Exclude Etherscan ERC-20
  );
}

/**
 * Detect if a CSV is a Solscan DeFi Activities export.
 * Key indicator: "Signature" + ("Activity" or "action") + ("TokenIn" or "Token In").
 */
export function isSolscanDefiCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("signature") &&
    (firstLine.includes("activity") || firstLine.includes("action")) &&
    (firstLine.includes("tokenin") ||
      firstLine.includes("token in") ||
      firstLine.includes("token_in")) &&
    !firstLine.includes("txhash")
  );
}

/**
 * Normalize a column name for flexible header matching.
 */
function findCol(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  return "";
}

/**
 * Parse Solscan SOL transfers CSV.
 *
 * Determines direction based on userAddress:
 * - From === userAddress → TRANSFER_OUT
 * - To === userAddress → TRANSFER_IN
 */
export function parseSolscanCsv(
  csv: string,
  userAddress: string = "",
): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];
  const addr = userAddress.toLowerCase();

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tsRaw =
        findCol(
          row,
          "timestamp",
          "datetime (utc)",
          "datetime",
          "blocktime",
          "time",
        ) || findCol(row, "block time");
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      const from = findCol(row, "from", "from address", "sender").toLowerCase();
      const to = findCol(row, "to", "to address", "receiver").toLowerCase();
      const amount = safeParseNumber(
        findCol(row, "amount(sol)", "amount (sol)", "amount", "value"),
      );
      const fee = safeParseNumber(
        findCol(
          row,
          "fee(sol)",
          "fee (sol)",
          "fee",
          "txnfee(sol)",
          "txn fee(sol)",
        ),
      );

      if (!amount || amount === 0) {
        continue; // Skip zero-amount transfers
      }

      // Determine direction
      const isOutgoing = addr && from === addr;
      const isIncoming = addr && to === addr;
      let type: ParsedTransaction["type"] = "UNKNOWN";

      if (isOutgoing && isIncoming) {
        // Self-transfer (e.g., wrapping SOL)
        type = "TRANSFER_IN";
      } else if (isOutgoing) {
        type = "TRANSFER_OUT";
      } else if (isIncoming) {
        type = "TRANSFER_IN";
      } else if (!addr) {
        // No user address provided — default to TRANSFER_IN
        type = "TRANSFER_IN";
      }

      const tx: ParsedTransaction = {
        type,
        timestamp,
      };

      if (type === "TRANSFER_OUT") {
        tx.sentAsset = "SOL";
        tx.sentAmount = Math.abs(amount);
      } else {
        tx.receivedAsset = "SOL";
        tx.receivedAmount = Math.abs(amount);
      }

      if (fee && fee > 0) {
        tx.feeAsset = "SOL";
        tx.feeAmount = fee;
      }

      const sig = findCol(
        row,
        "signature",
        "txhash",
        "tx hash",
        "tx signature",
      );
      if (sig) {
        tx.notes = sig.slice(0, 20) + "...";
      }

      transactions.push(tx);
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return {
    transactions,
    errors,
    summary: {
      totalRows: objects.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "solscan",
    },
  };
}

/**
 * Parse Solscan SPL token transfers CSV.
 *
 * Similar to SOL transfers but with token symbol from the CSV.
 */
export function parseSolscanSplCsv(
  csv: string,
  userAddress: string = "",
): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];
  const addr = userAddress.toLowerCase();

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tsRaw =
        findCol(
          row,
          "timestamp",
          "datetime (utc)",
          "datetime",
          "blocktime",
          "time",
        ) || findCol(row, "block time");
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      const tokenSymbol = findCol(
        row,
        "tokensymbol",
        "token symbol",
        "symbol",
        "token",
      ).toUpperCase();
      if (!tokenSymbol) {
        errors.push({ row: rowNum, message: "Missing token symbol" });
        continue;
      }

      const from = findCol(row, "from", "from address", "sender").toLowerCase();
      const to = findCol(row, "to", "to address", "receiver").toLowerCase();
      const amount = safeParseNumber(
        findCol(row, "amount", "tokenvalue", "token value", "value"),
      );

      if (!amount || amount === 0) {
        continue;
      }

      const isOutgoing = addr && from === addr;
      const isIncoming = addr && to === addr;
      let type: ParsedTransaction["type"] = "UNKNOWN";

      if (isOutgoing && isIncoming) {
        type = "TRANSFER_IN";
      } else if (isOutgoing) {
        type = "TRANSFER_OUT";
      } else if (isIncoming) {
        type = "TRANSFER_IN";
      } else if (!addr) {
        type = "TRANSFER_IN";
      }

      const tx: ParsedTransaction = {
        type,
        timestamp,
      };

      if (type === "TRANSFER_OUT") {
        tx.sentAsset = tokenSymbol;
        tx.sentAmount = Math.abs(amount);
      } else {
        tx.receivedAsset = tokenSymbol;
        tx.receivedAmount = Math.abs(amount);
      }

      const fee = safeParseNumber(findCol(row, "fee", "fee(sol)", "fee (sol)"));
      if (fee && fee > 0) {
        tx.feeAsset = "SOL";
        tx.feeAmount = fee;
      }

      const sig = findCol(row, "signature", "txhash", "tx hash");
      if (sig) {
        tx.notes = sig.slice(0, 20) + "...";
      }

      transactions.push(tx);
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return {
    transactions,
    errors,
    summary: {
      totalRows: objects.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "solscan",
    },
  };
}

// ─── DeFi Activity Parser ──────────────────────

/** Known Solana DEX/DeFi platforms for activity classification. */
const SOLANA_DEFI_PLATFORMS: Record<string, string> = {
  jupiter: "DEX",
  "jupiter aggregator": "DEX",
  raydium: "DEX",
  orca: "DEX",
  marinade: "STAKING",
  "marinade finance": "STAKING",
  lido: "STAKING",
  solend: "LENDING",
  mango: "DEX",
  "mango markets": "DEX",
  saber: "DEX",
  lifinity: "DEX",
  meteora: "DEX",
};

/**
 * Classify a DeFi activity string to a ParsedTransaction type.
 */
function classifyDefiActivity(
  activity: string,
  platform: string,
): ParsedTransaction["type"] {
  const a = activity.toLowerCase().trim();
  const p = platform.toLowerCase().trim();

  // Swap / Trade
  if (
    a.includes("swap") ||
    a.includes("trade") ||
    a.includes("exchange") ||
    a === "buy" ||
    a === "sell"
  ) {
    return "DEX_SWAP";
  }

  // LP operations
  if (
    a.includes("add liquidity") ||
    a.includes("deposit liquidity") ||
    a.includes("lp deposit")
  ) {
    return "LP_DEPOSIT";
  }
  if (
    a.includes("remove liquidity") ||
    a.includes("withdraw liquidity") ||
    a.includes("lp withdraw")
  ) {
    return "LP_WITHDRAWAL";
  }
  if (a.includes("lp reward") || a.includes("farming reward")) {
    return "LP_REWARD";
  }

  // Staking (SOL → mSOL/stSOL treated as WRAP for basis passthrough)
  if (
    a.includes("stake") &&
    !a.includes("unstake") &&
    !a.includes("withdraw")
  ) {
    return "WRAP";
  }
  if (a.includes("unstake") || a.includes("withdraw stake")) {
    return "UNWRAP";
  }

  // Staking rewards
  if (a.includes("reward") || a.includes("claim")) {
    return "STAKING_REWARD";
  }

  // Bridge
  if (a.includes("bridge out") || a.includes("bridge send")) {
    return "BRIDGE_OUT";
  }
  if (a.includes("bridge in") || a.includes("bridge receive")) {
    return "BRIDGE_IN";
  }

  // Fallback: if platform is a known DEX, assume swap
  if (SOLANA_DEFI_PLATFORMS[p] === "DEX") {
    return "DEX_SWAP";
  }
  if (SOLANA_DEFI_PLATFORMS[p] === "STAKING") {
    return "STAKING_REWARD";
  }

  return "UNKNOWN";
}

/**
 * Parse Solscan DeFi Activities CSV.
 *
 * Handles swaps, LP operations, staking, and other DeFi activities
 * exported from Solscan's DeFi tab.
 */
export function parseSolscanDefiCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tsRaw = findCol(
        row,
        "timestamp",
        "datetime (utc)",
        "datetime",
        "time",
        "block time",
      );
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      const activity = findCol(
        row,
        "activity",
        "activity type",
        "action",
        "type",
      );
      const platform = findCol(row, "platform", "protocol", "program", "dex");
      const tokenIn = findCol(
        row,
        "tokenin",
        "token in",
        "token_in",
        "input token",
        "from token",
      ).toUpperCase();
      const amountIn = safeParseNumber(
        findCol(
          row,
          "amountin",
          "amount in",
          "amount_in",
          "input amount",
          "from amount",
        ),
      );
      const tokenOut = findCol(
        row,
        "tokenout",
        "token out",
        "token_out",
        "output token",
        "to token",
      ).toUpperCase();
      const amountOut = safeParseNumber(
        findCol(
          row,
          "amountout",
          "amount out",
          "amount_out",
          "output amount",
          "to amount",
        ),
      );

      if (!tokenIn && !tokenOut) {
        errors.push({ row: rowNum, message: "Missing token in/out" });
        continue;
      }

      const type = classifyDefiActivity(activity, platform);

      const tx: ParsedTransaction = {
        type,
        timestamp,
      };

      // Sent side (token in — user gives this)
      if (tokenIn && amountIn && amountIn > 0) {
        tx.sentAsset = tokenIn;
        tx.sentAmount = Math.abs(amountIn);
      }

      // Received side (token out — user gets this)
      if (tokenOut && amountOut && amountOut > 0) {
        tx.receivedAsset = tokenOut;
        tx.receivedAmount = Math.abs(amountOut);
      }

      // Fee
      const fee = safeParseNumber(
        findCol(row, "fee", "fee(sol)", "fee (sol)", "network fee"),
      );
      if (fee && fee > 0) {
        tx.feeAsset = "SOL";
        tx.feeAmount = fee;
      }

      // Notes: platform + activity + signature
      const sig = findCol(row, "signature", "txhash", "tx hash");
      const notesParts: string[] = [];
      if (platform) notesParts.push(platform);
      if (activity) notesParts.push(activity);
      if (sig) notesParts.push(sig.slice(0, 16) + "...");
      if (notesParts.length > 0) {
        tx.notes = notesParts.join(" | ");
      }

      transactions.push(tx);
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return {
    transactions,
    errors,
    summary: {
      totalRows: objects.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "solscan_defi",
    },
  };
}
