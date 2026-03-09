/**
 * Bitget CSV Format Parser
 *
 * Handles Bitget's Spot Trade History export.
 * Common headers: Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time,Order Type
 * API-style: orderId,symbol,side,priceAvg,size,baseVolume,quoteVolume,fee,feeCurrency,cTime
 *
 * Symbol format: "BTCUSDT" or "BTCUSDT_SPBL" (spot) — concatenated, no separator
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

/** Known quote currencies for symbol splitting (longest match first) */
const KNOWN_QUOTES = [
  "USDT",
  "USDC",
  "BUSD",
  "DAI",
  "USD",
  "EUR",
  "GBP",
  "BTC",
  "ETH",
];

/**
 * Detect if a CSV is in Bitget trade history format.
 */
export function isBitgetCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  // Bitget-specific: "trading pair" or ("priceavg"/"basevolume") plus "side"
  if (
    firstLine.includes("trading pair") &&
    firstLine.includes("side") &&
    (firstLine.includes("filled") || firstLine.includes("total"))
  )
    return true;
  if (firstLine.includes("priceavg") && firstLine.includes("basevolume"))
    return true;
  if (
    firstLine.includes("symbol") &&
    firstLine.includes("side") &&
    firstLine.includes("quotevolume")
  )
    return true;
  return false;
}

/**
 * Split a Bitget symbol (e.g., "BTCUSDT" or "BTCUSDT_SPBL") into [base, quote].
 */
function splitSymbol(symbol: string): [string, string] | null {
  // Strip Bitget product suffix (e.g., "_SPBL" for spot)
  let s = symbol.toUpperCase().trim();
  const suffixIdx = s.indexOf("_");
  if (suffixIdx > 0) {
    s = s.slice(0, suffixIdx);
  }
  // Try known quote currencies
  for (const quote of KNOWN_QUOTES) {
    if (s.endsWith(quote) && s.length > quote.length) {
      return [s.slice(0, -quote.length), quote];
    }
  }
  // Try separator fallback
  const parts = s.split(/[-\/]/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return [parts[0], parts[1]];
  }
  return null;
}

/**
 * Parse a Bitget Spot Trade History CSV.
 */
export function parseBitgetCsv(csv: string): CsvParseResult {
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
      format: "bitget",
    },
  };
}

/** Parse a single Bitget trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Parse timestamp — multiple possible column names
  const tsRaw =
    row["order time"] ||
    row["trade time"] ||
    row["ctime"] ||
    row["time"] ||
    row["timestamp"] ||
    row["date"] ||
    "";

  // cTime might be Unix milliseconds
  let timestamp: string | null = null;
  const tsNum = Number(tsRaw);
  if (!isNaN(tsNum) && tsNum > 1e12) {
    timestamp = new Date(tsNum).toISOString();
  } else if (!isNaN(tsNum) && tsNum > 1e9) {
    timestamp = new Date(tsNum * 1000).toISOString();
  } else {
    timestamp = safeParseDateToIso(tsRaw);
  }

  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Parse symbol
  const symbolRaw = (
    row["trading pair"] ||
    row["symbol"] ||
    row["pair"] ||
    ""
  ).trim();
  const parsed = splitSymbol(symbolRaw);
  if (!parsed) {
    errors.push({ row: rowNum, message: `Invalid symbol: "${symbolRaw}"` });
    return null;
  }
  const [base, quote] = parsed;

  const side = (row["side"] || row["direction"] || "").toLowerCase().trim();
  const price = safeParseNumber(
    row["filled price"] ||
      row["priceavg"] ||
      row["price avg"] ||
      row["price"] ||
      row["avg. filled price"],
  );
  const qty = safeParseNumber(
    row["filled amount"] ||
      row["size"] ||
      row["basevolume"] ||
      row["base volume"] ||
      row["qty"] ||
      row["amount"],
  );
  const total = safeParseNumber(
    row["total"] ||
      row["quotevolume"] ||
      row["quote volume"] ||
      row["value"] ||
      row["funds"],
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

  if (!qty || qty <= 0) {
    errors.push({ row: rowNum, message: "Invalid quantity" });
    return null;
  }

  const isBuy = side === "buy";
  const isFiatQuote = FIAT_CURRENCIES.has(quote);
  const computedTotal = total || (price ? price * qty : 0);

  const tx: ParsedTransaction = {
    type: isFiatQuote ? (isBuy ? "BUY" : "SELL") : "TRADE",
    timestamp,
  };

  if (isBuy) {
    tx.receivedAsset = base;
    tx.receivedAmount = qty;
    tx.sentAsset = quote;
    tx.sentAmount = computedTotal;
    if (isFiatQuote && computedTotal) tx.receivedValueUsd = computedTotal;
  } else {
    tx.sentAsset = base;
    tx.sentAmount = qty;
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
