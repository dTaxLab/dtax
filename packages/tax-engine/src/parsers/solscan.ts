/**
 * Solscan CSV Format Parser
 *
 * Handles CSV exports from Solscan.io (Solana blockchain explorer).
 * Supports two export formats:
 *
 * 1. SOL Transfers — native SOL transfer history
 *    Columns: Signature, Block, Timestamp, From, To, Amount(SOL), Fee(SOL)
 *
 * 2. SPL Token Transfers — SPL token transfer history
 *    Columns: Signature, Block, Timestamp, From, To, Amount, TokenAddress, TokenName, TokenSymbol
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
