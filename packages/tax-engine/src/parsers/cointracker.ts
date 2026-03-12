/**
 * CoinTracker CSV Format Parser
 *
 * Handles the CoinTracker transaction history export:
 * Date, Received Quantity, Received Currency, Sent Quantity, Sent Currency,
 * Fee Amount, Fee Currency, Tag
 *
 * CoinTracker has NO "Type" column — type is inferred from which fields
 * are populated combined with the optional Tag value.
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/** Fiat and stablecoin set for BUY/SELL detection */
const FIAT_SET = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "KRW",
  "INR",
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "GUSD",
  "PAX",
]);

/**
 * Map CoinTracker tag + transaction shape to DTax type and optional notes.
 *
 * Args:
 *   tag: The Tag column value (lowercased)
 *   hasSent: Whether a Sent amount is present
 *   hasReceived: Whether a Received amount is present
 *   sentAsset: The Sent Currency (uppercased)
 *   receivedAsset: The Received Currency (uppercased)
 *
 * Returns:
 *   Object with type and optional notes
 */
function mapCoinTrackerType(
  tag: string,
  hasSent: boolean,
  hasReceived: boolean,
  sentAsset: string,
  receivedAsset: string,
): { type: ParsedTransaction["type"]; notes?: string } {
  const t = tag.toLowerCase().trim();

  // Tag-based mappings
  if (t === "staked" && hasReceived) return { type: "STAKING_REWARD" };
  if (t === "mined" && hasReceived) return { type: "MINING_REWARD" };
  if (t === "airdrop" && hasReceived) return { type: "AIRDROP" };
  if (t === "fork" && hasReceived) return { type: "AIRDROP" };
  if (t === "income" && hasReceived) return { type: "INTEREST" };
  if (t === "gift") {
    if (hasReceived) return { type: "GIFT_RECEIVED" };
    return { type: "GIFT_SENT" };
  }
  if (t === "lost") return { type: "TRANSFER_OUT", notes: "lost" };
  if (t === "donation") return { type: "TRANSFER_OUT", notes: "donation" };
  if (t === "payment") {
    if (hasSent) return { type: "SELL" };
    if (hasReceived) return { type: "BUY" };
  }

  // No tag — infer from shape
  if (!t) {
    if (hasReceived && hasSent) {
      if (FIAT_SET.has(sentAsset)) return { type: "BUY" };
      if (FIAT_SET.has(receivedAsset)) return { type: "SELL" };
      return { type: "TRADE" };
    }
    if (hasReceived && !hasSent) return { type: "TRANSFER_IN" };
    if (hasSent && !hasReceived) return { type: "TRANSFER_OUT" };
  }

  return { type: "UNKNOWN" };
}

/**
 * Detect if a CSV is in CoinTracker format.
 *
 * Requires ALL of: received quantity, received currency, sent quantity,
 * sent currency. The key distinguisher from Koinly is "received quantity"
 * (vs Koinly's "received amount").
 */
export function isCoinTrackerCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("received quantity") &&
    firstLine.includes("received currency") &&
    firstLine.includes("sent quantity") &&
    firstLine.includes("sent currency")
  );
}

/**
 * Parse a CoinTracker CSV export.
 *
 * Returns:
 *   CsvParseResult with transactions, errors, and summary
 */
export function parseCoinTrackerCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const errors: CsvParseError[] = [];
  const transactions: ParsedTransaction[] = [];

  if (objects.length === 0) {
    return {
      transactions,
      errors,
      summary: {
        totalRows: 0,
        parsed: 0,
        failed: 0,
        format: "cointracker",
      },
    };
  }

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tx = parseRow(row, rowNum, errors);
      if (tx) transactions.push(tx);
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  transactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    transactions,
    errors,
    summary: {
      totalRows: objects.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "cointracker",
    },
  };
}

/**
 * Parse a single CoinTracker CSV row.
 *
 * Args:
 *   row: Key-value object from CSV parsing (keys are lowercased headers)
 *   rowNum: 1-based row number for error reporting
 *   errors: Mutable array to collect parse errors
 *
 * Returns:
 *   ParsedTransaction or null if row is invalid/skipped
 */
function parseRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  const tsRaw = row["date"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const rcvAmt = safeParseNumber(row["received quantity"]);
  const rcvCur = (row["received currency"] || "").toUpperCase().trim();
  const sentAmt = safeParseNumber(row["sent quantity"]);
  const sentCur = (row["sent currency"] || "").toUpperCase().trim();
  const feeAmt = safeParseNumber(row["fee amount"]);
  const feeCur = (row["fee currency"] || "").toUpperCase().trim();
  const tag = row["tag"] || "";

  const hasSent = !!(sentAmt && sentCur);
  const hasReceived = !!(rcvAmt && rcvCur);

  if (!hasSent && !hasReceived) {
    errors.push({ row: rowNum, message: "No amount found" });
    return null;
  }

  const { type, notes } = mapCoinTrackerType(
    tag,
    hasSent,
    hasReceived,
    sentCur,
    rcvCur,
  );

  const tx: ParsedTransaction = { type, timestamp };

  if (hasSent) {
    tx.sentAsset = sentCur;
    tx.sentAmount = sentAmt;
  }
  if (hasReceived) {
    tx.receivedAsset = rcvCur;
    tx.receivedAmount = rcvAmt;
  }
  if (feeAmt && feeCur) {
    tx.feeAsset = feeCur;
    tx.feeAmount = feeAmt;
  }
  if (notes) {
    tx.notes = notes;
  }

  return tx;
}
