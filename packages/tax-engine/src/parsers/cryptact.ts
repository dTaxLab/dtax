/**
 * Cryptact Custom File CSV Parser
 *
 * Handles the Cryptact transaction history export (10 columns):
 * Timestamp, Action, Source, Base, Volume, Counter, Price, Fee, FeeCcy, Comment
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
 * Map Cryptact Action to DTax TxType and optional notes.
 */
function mapCryptactAction(action: string): {
  type: ParsedTransaction["type"];
  notes?: string;
  shape: "buy" | "sell" | "income" | "outgoing" | "trade";
} {
  const a = action.toUpperCase().trim();

  switch (a) {
    case "BUY":
      return { type: "BUY", shape: "buy" };
    case "SELL":
      return { type: "SELL", shape: "sell" };
    case "BONUS":
      return { type: "AIRDROP", shape: "income" };
    case "STAKING":
      return { type: "STAKING_REWARD", shape: "income" };
    case "LENDING":
      return { type: "INTEREST", shape: "income" };
    case "LEND":
      return { type: "TRANSFER_OUT", notes: "lending", shape: "outgoing" };
    case "RECOVER":
      return {
        type: "TRANSFER_IN",
        notes: "lending recovery",
        shape: "income",
      };
    case "BORROW":
      return { type: "TRANSFER_IN", notes: "borrow", shape: "income" };
    case "RETURN":
      return { type: "TRANSFER_OUT", notes: "loan return", shape: "outgoing" };
    case "SENDFEE":
      return { type: "TRANSFER_OUT", notes: "send fee", shape: "outgoing" };
    case "DEFIFEE":
      return { type: "TRANSFER_OUT", notes: "defi fee", shape: "outgoing" };
    case "LOSS":
      return { type: "TRANSFER_OUT", notes: "loss", shape: "outgoing" };
    case "REDUCE":
      return { type: "SELL", shape: "sell" };
    case "SETTLE":
      return { type: "TRADE", shape: "trade" };
    default:
      return {
        type: "UNKNOWN",
        notes: `unknown action: ${a}`,
        shape: "income",
      };
  }
}

/**
 * Detect if a CSV is in Cryptact Custom File format.
 *
 * Requires ALL of: timestamp, action, source, base, volume, counter,
 * price, fee, feeccy (case-insensitive). The key distinguisher is `feeccy`.
 */
export function isCryptactCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("timestamp") &&
    firstLine.includes("action") &&
    firstLine.includes("source") &&
    firstLine.includes("base") &&
    firstLine.includes("volume") &&
    firstLine.includes("counter") &&
    firstLine.includes("price") &&
    firstLine.includes("fee") &&
    firstLine.includes("feeccy")
  );
}

/**
 * Parse a Cryptact Custom File CSV export.
 */
export function parseCryptactCsv(csv: string): CsvParseResult {
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
        format: "cryptact",
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
      format: "cryptact",
    },
  };
}

/**
 * Parse a single Cryptact CSV row.
 */
function parseRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  const tsRaw = row["timestamp"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const actionRaw = (row["action"] || "").trim();
  if (!actionRaw) {
    errors.push({ row: rowNum, message: "Missing action" });
    return null;
  }

  const source = (row["source"] || "").trim();
  const base = (row["base"] || "").toUpperCase().trim();
  const volume = safeParseNumber(row["volume"]);
  const counter = (row["counter"] || "").toUpperCase().trim();
  const price = safeParseNumber(row["price"]);
  const fee = safeParseNumber(row["fee"]);
  const feeCcy = (row["feeccy"] || "").toUpperCase().trim();
  const comment = (row["comment"] || "").trim();

  if (!base || !volume) {
    errors.push({ row: rowNum, message: "Missing base asset or volume" });
    return null;
  }

  const { type, notes: actionNotes, shape } = mapCryptactAction(actionRaw);

  const tx: ParsedTransaction = { type, timestamp };

  switch (shape) {
    case "buy":
      tx.receivedAsset = base;
      tx.receivedAmount = volume;
      if (counter && price) {
        tx.sentAsset = counter;
        tx.sentAmount = volume * price;
      }
      break;

    case "sell":
      tx.sentAsset = base;
      tx.sentAmount = volume;
      if (counter && price) {
        tx.receivedAsset = counter;
        tx.receivedAmount = volume * price;
      }
      break;

    case "trade":
      tx.sentAsset = base;
      tx.sentAmount = volume;
      if (counter && price) {
        tx.receivedAsset = counter;
        tx.receivedAmount = volume * price;
      }
      break;

    case "income":
      tx.receivedAsset = base;
      tx.receivedAmount = volume;
      break;

    case "outgoing":
      tx.sentAsset = base;
      tx.sentAmount = volume;
      break;
  }

  // Fee
  if (fee && feeCcy) {
    tx.feeAsset = feeCcy;
    tx.feeAmount = fee;
  }

  // Build notes from action notes, source, and comment
  const noteParts: string[] = [];
  if (actionNotes) noteParts.push(actionNotes);
  if (source) noteParts.push(`source: ${source}`);
  if (comment) noteParts.push(comment);
  if (noteParts.length > 0) {
    tx.notes = noteParts.join("; ");
  }

  return tx;
}
