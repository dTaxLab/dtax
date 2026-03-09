/**
 * OKX CSV Format Parser
 *
 * Handles OKX's Trade History export:
 * Common headers: Order ID, Trade ID, Trade Time, Pair, Side, Price, Amount, Total, Fee, Fee Currency
 *
 * OKX pairs: "BTC-USDT", "ETH-BTC" (BASE-QUOTE with hyphen)
 * Side: "buy" or "sell"
 * Trade Time: ISO 8601 or "YYYY-MM-DD HH:mm:ss"
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

const FIAT_CURRENCIES = new Set([
  "USD",
  "USDT",
  "USDC",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "JPY",
  "BUSD",
  "DAI",
]);

/**
 * Detect if a CSV is in OKX trade history format.
 */
export function isOkxCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  // OKX exports typically have "pair" or "instrument" and "side"
  return (
    (firstLine.includes("pair") || firstLine.includes("instrument")) &&
    firstLine.includes("side") &&
    (firstLine.includes("fee") || firstLine.includes("total"))
  );
}

/**
 * Parse an OKX Trade History CSV.
 */
export function parseOkxCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const errors: CsvParseError[] = [];
  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tx = parseTradeRow(row, rowNum, errors);
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
      format: "okx",
    },
  };
}

/** Parse a single OKX trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Parse timestamp
  const tsRaw =
    row["trade time"] ||
    row["tradetime"] ||
    row["time"] ||
    row["timestamp"] ||
    "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Parse pair: "BTC-USDT" or "BTC/USDT"
  const pair = (row["pair"] || row["instrument"] || row["symbol"] || "")
    .toUpperCase()
    .trim();
  const parts = pair.split(/[-\/]/);
  if (parts.length !== 2) {
    errors.push({ row: rowNum, message: `Invalid pair: "${pair}"` });
    return null;
  }
  const [base, quote] = parts;

  const side = (row["side"] || row["direction"] || "").toLowerCase().trim();
  const amount = safeParseNumber(
    row["amount"] || row["quantity"] || row["filled qty"],
  );
  const total = safeParseNumber(
    row["total"] || row["funds"] || row["filled amount"],
  );
  const fee = safeParseNumber(row["fee"]);
  const feeCurrency = (
    row["fee currency"] ||
    row["feecurrency"] ||
    row["fee ccy"] ||
    ""
  )
    .toUpperCase()
    .trim();

  if (!amount || amount <= 0) {
    errors.push({ row: rowNum, message: "Invalid amount" });
    return null;
  }

  const isBuy = side === "buy";
  const isFiatQuote = FIAT_CURRENCIES.has(quote);

  const tx: ParsedTransaction = {
    type: isFiatQuote ? (isBuy ? "BUY" : "SELL") : "TRADE",
    timestamp,
  };

  if (isBuy) {
    tx.receivedAsset = base;
    tx.receivedAmount = amount;
    tx.sentAsset = quote;
    tx.sentAmount = total || 0;
    if (isFiatQuote && total) tx.receivedValueUsd = total;
  } else {
    tx.sentAsset = base;
    tx.sentAmount = amount;
    tx.receivedAsset = quote;
    tx.receivedAmount = total || 0;
    if (isFiatQuote && total) tx.sentValueUsd = total;
  }

  if (fee && Math.abs(fee) > 0) {
    tx.feeAmount = Math.abs(fee);
    tx.feeAsset = feeCurrency || quote;
    if (FIAT_CURRENCIES.has(tx.feeAsset)) {
      tx.feeValueUsd = Math.abs(fee);
    }
  }

  return tx;
}
