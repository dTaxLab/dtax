/**
 * Koinly CSV Format Parser
 *
 * Handles the Koinly Universal/Common transaction history export:
 * Date, Sent Amount, Sent Currency, Received Amount, Received Currency,
 * Fee Amount, Fee Currency, Net Worth Amount, Net Worth Currency, Label, Description, TxHash
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
 * Map Koinly label + transaction shape to DTax type and optional notes.
 */
function mapKoinlyType(
  label: string,
  hasSent: boolean,
  hasReceived: boolean,
  sentAsset: string,
  receivedAsset: string,
): { type: ParsedTransaction["type"]; notes?: string } {
  const l = label.toLowerCase().trim();

  // Label-based mappings
  if (l === "airdrop") return { type: "AIRDROP" };
  if (l === "staking" || l === "reward") return { type: "STAKING_REWARD" };
  if (l === "mining") return { type: "MINING_REWARD" };
  if (l === "lending interest") return { type: "INTEREST" };
  if (l === "income" || l === "salary" || l === "cashback")
    return { type: "INTEREST" };
  if (l === "gift") {
    if (hasReceived) return { type: "GIFT_RECEIVED" };
    return { type: "GIFT_SENT" };
  }
  if (l === "lost") return { type: "TRANSFER_OUT", notes: "lost" };
  if (l === "donation") return { type: "TRANSFER_OUT", notes: "donation" };
  if (l === "fork") return { type: "AIRDROP" };
  if (l === "swap") return { type: "TRADE", notes: "tax-free swap (Koinly)" };
  if (l === "stake") {
    if (hasReceived)
      return { type: "TRANSFER_IN", notes: "staking withdrawal" };
    return { type: "TRANSFER_OUT", notes: "staking deposit" };
  }
  if (l === "loan" || l === "margin loan")
    return { type: "TRANSFER_IN", notes: l };
  if (l === "loan repayment" || l === "margin repayment")
    return { type: "TRANSFER_OUT", notes: l };
  if (l === "cost" || l === "loan fee" || l === "margin fee")
    return { type: "TRANSFER_OUT", notes: l };
  if (l === "realized gain")
    return { type: "UNKNOWN", notes: "realized gain — needs manual review" };
  if (l === "fee refund") return { type: "TRANSFER_IN", notes: "fee refund" };

  // No label — infer from shape
  if (!l) {
    if (hasReceived && !hasSent) return { type: "TRANSFER_IN" };
    if (hasSent && !hasReceived) return { type: "TRANSFER_OUT" };
    if (hasSent && hasReceived) {
      if (FIAT_SET.has(sentAsset)) return { type: "BUY" };
      if (FIAT_SET.has(receivedAsset)) return { type: "SELL" };
      return { type: "TRADE" };
    }
  }

  return { type: "UNKNOWN" };
}

/**
 * Detect if a CSV is in Koinly format.
 *
 * Requires ALL of: sent amount, sent currency, received amount,
 * received currency, AND net worth amount (distinguishes from Generic format).
 */
export function isKoinlyCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("sent amount") &&
    firstLine.includes("sent currency") &&
    firstLine.includes("received amount") &&
    firstLine.includes("received currency") &&
    firstLine.includes("net worth amount")
  );
}

/**
 * Parse a Koinly Universal CSV export.
 */
export function parseKoinlyCsv(csv: string): CsvParseResult {
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
        format: "koinly",
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
      format: "koinly",
    },
  };
}

/**
 * Parse a single Koinly CSV row.
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

  const sentAmt = safeParseNumber(row["sent amount"]);
  const sentCur = (row["sent currency"] || "").toUpperCase().trim();
  const rcvAmt = safeParseNumber(row["received amount"]);
  const rcvCur = (row["received currency"] || "").toUpperCase().trim();
  const feeAmt = safeParseNumber(row["fee amount"]);
  const feeCur = (row["fee currency"] || "").toUpperCase().trim();
  const netWorth = safeParseNumber(row["net worth amount"]);
  const netWorthCur = (row["net worth currency"] || "").toUpperCase().trim();
  const label = row["label"] || "";
  const description = row["description"] || "";
  const txHash = row["txhash"] || "";

  const hasSent = !!(sentAmt && sentCur);
  const hasReceived = !!(rcvAmt && rcvCur);

  if (!hasSent && !hasReceived) {
    errors.push({ row: rowNum, message: "No amount found" });
    return null;
  }

  const { type, notes: labelNotes } = mapKoinlyType(
    label,
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

  // Net Worth USD mapping
  if (netWorth && netWorthCur === "USD") {
    if (hasSent && !hasReceived) {
      tx.sentValueUsd = netWorth;
    } else if (hasReceived && !hasSent) {
      tx.receivedValueUsd = netWorth;
    } else if (hasSent && hasReceived) {
      // Trade: map to both sides as best estimate
      tx.sentValueUsd = netWorth;
      tx.receivedValueUsd = netWorth;
    }
  }

  // Build notes from label notes, description, and txhash
  const noteParts: string[] = [];
  if (labelNotes) noteParts.push(labelNotes);
  if (description) noteParts.push(description);
  if (txHash) noteParts.push(`txhash:${txHash}`);
  if (noteParts.length > 0) {
    tx.notes = noteParts.join("; ");
  }

  return tx;
}
