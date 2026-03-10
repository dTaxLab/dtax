/**
 * Bitfinex CSV Format Parser
 *
 * Handles Bitfinex's Trade History export.
 * Common headers: #,PAIR,AMOUNT,PRICE,FEE,FEE CURRENCY,DATE,ORDER ID
 *
 * PAIR format: "BTCUSD", "tBTCUSD", "ETHUSD" (optional "t" prefix, no separator)
 * AMOUNT: positive = buy, negative = sell
 * FEE: always negative
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
  "CNH",
  "DAI",
  "BUSD",
]);

/** Known quote currencies for symbol splitting (longest match first) */
const KNOWN_QUOTES = [
  "USDT",
  "USDC",
  "BUSD",
  "DAI",
  "UST",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNH",
  "BTC",
  "ETH",
];

/**
 * Detect if a CSV is in Bitfinex trade history format.
 * Unique identifier: "#" column as first field (literal hash column name) + "pair" + "fee currency"
 * Bitfinex is the only exchange that uses "#" as a column header.
 */
export function isBitfinexCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0] || "";
  const lower = firstLine.toLowerCase();
  // Must have "pair" and "fee currency" (with space)
  if (!lower.includes("pair") || !lower.includes("fee currency")) return false;
  // Unique: "#" as a column name (typically first column)
  // Check for "#" at start or after comma
  return /(?:^|,)\s*#\s*(?:,|$)/.test(firstLine);
}

/**
 * Split a Bitfinex pair (e.g., "tBTCUSD", "BTCUSD", "BTC:USD") into [base, quote].
 */
function splitPair(pair: string): [string, string] | null {
  let s = pair.toUpperCase().trim();

  // Remove "t" prefix used in Bitfinex API symbols
  if (s.startsWith("T") && s.length > 4) {
    s = s.slice(1);
  }

  // Try colon separator (Bitfinex derivative format: "BTC:USD")
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return [parts[0], parts[1]];
    }
  }

  // Try slash or hyphen separator
  const sepParts = s.split(/[-\/]/);
  if (sepParts.length === 2 && sepParts[0] && sepParts[1]) {
    return [sepParts[0], sepParts[1]];
  }

  // Concatenated — try known quotes (longest first)
  for (const quote of KNOWN_QUOTES) {
    if (s.endsWith(quote) && s.length > quote.length) {
      return [s.slice(0, -quote.length), quote];
    }
  }

  return null;
}

/**
 * Parse a Bitfinex Trade History CSV.
 */
export function parseBitfinexCsv(csv: string): CsvParseResult {
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
      format: "bitfinex",
    },
  };
}

/** Parse a single Bitfinex trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Timestamp
  const tsRaw =
    row["date"] || row["datetime"] || row["time"] || row["timestamp"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Pair
  const pairRaw = (
    row["pair"] ||
    row["symbol"] ||
    row["currency pair"] ||
    ""
  ).trim();
  const parsed = splitPair(pairRaw);
  if (!parsed) {
    errors.push({ row: rowNum, message: `Invalid pair: "${pairRaw}"` });
    return null;
  }
  const [base, quote] = parsed;

  // Amount — positive = buy, negative = sell
  const amount = safeParseNumber(
    row["amount"] || row["qty"] || row["quantity"],
  );
  if (!amount || amount === 0) {
    errors.push({ row: rowNum, message: "Invalid amount" });
    return null;
  }

  const isBuy = amount > 0;
  const absAmount = Math.abs(amount);

  // Price
  const price = safeParseNumber(row["price"] || row["exec price"]);
  const total = price ? price * absAmount : 0;

  // Fee
  const fee = safeParseNumber(row["fee"] || row["trading fee"]);
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
    tx.receivedAmount = absAmount;
    tx.sentAsset = quote;
    tx.sentAmount = total;
    if (isFiatQuote && total) tx.receivedValueUsd = total;
  } else {
    tx.sentAsset = base;
    tx.sentAmount = absAmount;
    tx.receivedAsset = quote;
    tx.receivedAmount = total;
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
