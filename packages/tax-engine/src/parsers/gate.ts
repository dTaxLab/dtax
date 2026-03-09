/**
 * Gate.io CSV Format Parser
 *
 * Handles Gate.io's Spot Trade History export.
 * Common headers: No,Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date
 * API-style: id,currency_pair,side,role,amount,price,fee,fee_currency,create_time,point_fee
 *
 * Gate.io pairs: "BTC_USDT", "ETH_BTC" (BASE_QUOTE with underscore)
 * Side: "buy" or "sell"
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
 * Detect if a CSV is in Gate.io trade history format.
 */
export function isGateCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  // Gate.io: has "currency_pair" or ("pair" + "role"), plus "side" or "fee"
  if (firstLine.includes("currency_pair") && firstLine.includes("side"))
    return true;
  if (
    firstLine.includes("pair") &&
    firstLine.includes("role") &&
    (firstLine.includes("filled price") || firstLine.includes("filled amount"))
  )
    return true;
  return false;
}

/**
 * Parse a Gate.io Spot Trade History CSV.
 */
export function parseGateCsv(csv: string): CsvParseResult {
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
      format: "gate",
    },
  };
}

/** Parse a single Gate.io trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Parse timestamp
  const tsRaw =
    row["date"] || row["create_time"] || row["time"] || row["timestamp"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Parse pair: "BTC_USDT" or "BTC/USDT" or "BTC-USDT"
  const pairRaw = (row["pair"] || row["currency_pair"] || row["symbol"] || "")
    .toUpperCase()
    .trim();
  const parts = pairRaw.split(/[_\-\/]/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    errors.push({ row: rowNum, message: `Invalid pair: "${pairRaw}"` });
    return null;
  }
  const [base, quote] = parts;

  const side = (row["side"] || row["direction"] || "").toLowerCase().trim();
  const amount = safeParseNumber(
    row["filled amount"] || row["amount"] || row["qty"] || row["quantity"],
  );
  const price = safeParseNumber(
    row["filled price"] || row["price"] || row["avg. filled price"],
  );
  const total = safeParseNumber(row["total"] || row["funds"] || row["value"]);
  const fee = safeParseNumber(row["fee"]);
  const feeCurrency = (
    row["fee currency"] ||
    row["fee_currency"] ||
    row["feecurrency"] ||
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
  const computedTotal = total || (price ? price * amount : 0);

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

  if (fee && Math.abs(fee) > 0) {
    tx.feeAmount = Math.abs(fee);
    tx.feeAsset = feeCurrency || quote;
    if (FIAT_CURRENCIES.has(tx.feeAsset)) {
      tx.feeValueUsd = Math.abs(fee);
    }
  }

  return tx;
}
