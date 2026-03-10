/**
 * Poloniex CSV Format Parser
 *
 * Handles Poloniex's Trade History export.
 * Headers: Date,Market,Category,Type,Price,Amount,Total,Fee,Order Number,
 *          Base Total Less Fee,Quote Total Less Fee,Fee Currency,Fee Total
 *
 * Market format: "BTC/USDT", "ETH/BTC" (slash separator)
 * Type: "Buy" or "Sell"
 * Fee: percentage string like "0.00145" (0.145%)
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
  "JPY",
  "DAI",
  "BUSD",
]);

/**
 * Detect if a CSV is in Poloniex trade history format.
 * Unique: "base total less fee" or "quote total less fee" columns.
 */
export function isPoloniexCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("market") &&
    (firstLine.includes("base total less fee") ||
      firstLine.includes("quote total less fee"))
  );
}

/**
 * Split a Poloniex market pair (e.g., "BTC/USDT", "ETH/BTC").
 * Poloniex uses slash separator. Format: BASE/QUOTE.
 */
function splitMarket(market: string): [string, string] | null {
  const s = market.toUpperCase().trim();
  const parts = s.split(/[\/\-_]/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return [parts[0], parts[1]];
  }
  return null;
}

/**
 * Parse a Poloniex Trade History CSV.
 */
export function parsePoloniexCsv(csv: string): CsvParseResult {
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
      format: "poloniex",
    },
  };
}

/** Parse a single Poloniex trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Timestamp
  const tsRaw = row["date"] || row["datetime"] || row["time"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Market pair
  const marketRaw = (
    row["market"] ||
    row["pair"] ||
    row["symbol"] ||
    ""
  ).trim();
  const parsed = splitMarket(marketRaw);
  if (!parsed) {
    errors.push({ row: rowNum, message: `Invalid market: "${marketRaw}"` });
    return null;
  }
  const [base, quote] = parsed;

  // Type (Buy/Sell)
  const type = (row["type"] || row["side"] || "").toLowerCase().trim();
  const isBuy = type === "buy";
  if (type !== "buy" && type !== "sell") {
    errors.push({ row: rowNum, message: `Unknown type: "${type}"` });
    return null;
  }

  // Amount and Total
  const amount = safeParseNumber(row["amount"] || row["quantity"]);
  const total = safeParseNumber(
    row["total"] || row["quote total less fee"] || row["funds"],
  );
  const price = safeParseNumber(row["price"]);

  if (!amount || amount <= 0) {
    errors.push({ row: rowNum, message: "Invalid amount" });
    return null;
  }

  const computedTotal = total || (price ? price * amount : 0);

  // Fee
  const feeTotal = safeParseNumber(row["fee total"] || row["fee amount"]);
  const feeCurrency = (row["fee currency"] || row["fee ccy"] || "")
    .toUpperCase()
    .trim();

  const isFiatQuote = FIAT_CURRENCIES.has(quote);

  const tx: ParsedTransaction = {
    type: isFiatQuote ? (isBuy ? "BUY" : "SELL") : "TRADE",
    timestamp,
  };

  if (isBuy) {
    tx.receivedAsset = base;
    tx.receivedAmount = amount;
    tx.sentAsset = quote;
    tx.sentAmount = computedTotal;
    if (isFiatQuote && computedTotal) tx.receivedValueUsd = computedTotal;
  } else {
    tx.sentAsset = base;
    tx.sentAmount = amount;
    tx.receivedAsset = quote;
    tx.receivedAmount = computedTotal;
    if (isFiatQuote && computedTotal) tx.sentValueUsd = computedTotal;
  }

  if (feeTotal && Math.abs(feeTotal) > 0) {
    tx.feeAmount = Math.abs(feeTotal);
    tx.feeAsset = feeCurrency || quote;
    if (FIAT_CURRENCIES.has(tx.feeAsset)) {
      tx.feeValueUsd = Math.abs(feeTotal);
    }
  }

  return tx;
}
