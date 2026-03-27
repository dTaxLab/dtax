/**
 * Robinhood Crypto CSV Format Parser
 *
 * Handles Robinhood's Account Activity CSV export for crypto transactions:
 * Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
 *
 * Trans Code: Buy, Sell, Send, Receive, CDIV (crypto dividend/reward)
 * Amount: negative for outflows (Buy, Send), positive for inflows (Sell, Receive)
 * Price: USD price per unit at time of transaction
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/** Map Robinhood Trans Code to DTax type */
function mapRobinhoodType(transCode: string): ParsedTransaction["type"] {
  switch (transCode.toUpperCase().trim()) {
    case "BUY":
      return "BUY";
    case "SELL":
      return "SELL";
    case "SEND":
      return "TRANSFER_OUT";
    case "RECEIVE":
      return "TRANSFER_IN";
    case "CDIV":
      return "STAKING_REWARD";
    default:
      return "UNKNOWN";
  }
}

/**
 * Detect if a CSV is in Robinhood crypto activity format.
 * Unique: "trans code" column alongside "activity date" and "instrument".
 */
export function isRobinhoodCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("activity date") &&
    firstLine.includes("trans code") &&
    firstLine.includes("instrument")
  );
}

/**
 * Parse a Robinhood Account Activity CSV.
 */
export function parseRobinhoodCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const errors: CsvParseError[] = [];
  const transactions: ParsedTransaction[] = [];

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
      format: "robinhood",
    },
  };
}

function parseRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Timestamp — "activity date" in MM/DD/YYYY format
  const tsRaw = row["activity date"] || row["date"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const instrument = (row["instrument"] || "").toUpperCase().trim();
  if (!instrument) {
    // Non-crypto rows (e.g. cash sweeps) — skip silently
    return null;
  }

  const transCode = row["trans code"] || row["transcode"] || "";
  const txType = mapRobinhoodType(transCode);

  if (txType === "UNKNOWN") {
    // Skip unrecognised codes (stock dividends, corporate actions, etc.)
    return null;
  }

  // Quantity is always positive
  const quantity = safeParseNumber(row["quantity"] || "");
  // Price in USD per unit
  const price = safeParseNumber((row["price"] || "").replace(/[$,]/g, ""));
  // Amount: negative = USD out, positive = USD in
  const amount = safeParseNumber((row["amount"] || "").replace(/[$,]/g, ""));

  const usdValue =
    amount != null
      ? Math.abs(amount)
      : price && quantity
        ? price * quantity
        : undefined;

  if (!quantity || quantity <= 0) {
    if (txType === "TRANSFER_IN" || txType === "TRANSFER_OUT") {
      // Some withdrawal/deposit rows may lack quantity — skip
      return null;
    }
    errors.push({ row: rowNum, message: "Invalid quantity" });
    return null;
  }

  const tx: ParsedTransaction = { type: txType, timestamp };

  switch (txType) {
    case "BUY":
      tx.receivedAsset = instrument;
      tx.receivedAmount = quantity;
      tx.sentAsset = "USD";
      tx.sentAmount = usdValue;
      if (usdValue) tx.receivedValueUsd = usdValue;
      break;
    case "SELL":
      tx.sentAsset = instrument;
      tx.sentAmount = quantity;
      tx.receivedAsset = "USD";
      tx.receivedAmount = usdValue;
      if (usdValue) tx.sentValueUsd = usdValue;
      break;
    case "TRANSFER_OUT":
      tx.sentAsset = instrument;
      tx.sentAmount = quantity;
      break;
    case "TRANSFER_IN":
      tx.receivedAsset = instrument;
      tx.receivedAmount = quantity;
      break;
    case "STAKING_REWARD":
      tx.receivedAsset = instrument;
      tx.receivedAmount = quantity;
      if (usdValue) tx.receivedValueUsd = usdValue;
      break;
  }

  return tx;
}
