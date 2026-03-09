/**
 * KuCoin CSV Format Parser
 *
 * Handles KuCoin's Trade History export:
 * trade_id, symbol, order_type, deal_price, amount, direction, funds, fee_currency, fee, created_at, created_date
 *
 * Symbol format: "BTC-USDT", "ETH-BTC" (BASE-QUOTE)
 * Direction: "buy" or "sell"
 * Timestamp: Unix milliseconds or human-readable date
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
]);

/**
 * Detect if a CSV is in KuCoin trade history format.
 */
export function isKuCoinCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    (firstLine.includes("symbol") || firstLine.includes("trade_id")) &&
    firstLine.includes("direction") &&
    (firstLine.includes("deal_price") || firstLine.includes("funds"))
  );
}

/**
 * Parse a KuCoin Trade History CSV.
 */
export function parseKuCoinCsv(csv: string): CsvParseResult {
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
      format: "kucoin",
    },
  };
}

/** Parse a single KuCoin trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Parse timestamp: try created_at (unix ms) first, then created_date
  let timestamp: string | null = null;
  const createdAt = row["created_at"] || row["createdat"];
  const createdDate =
    row["created_date"] || row["createddate"] || row["time"] || "";

  if (createdAt) {
    const ms = safeParseNumber(createdAt);
    if (ms && ms > 1e12) {
      // Unix milliseconds
      timestamp = new Date(ms).toISOString();
    } else if (ms && ms > 1e9) {
      // Unix seconds
      timestamp = new Date(ms * 1000).toISOString();
    }
  }
  if (!timestamp && createdDate) {
    timestamp = safeParseDateToIso(createdDate);
  }

  if (!timestamp) {
    errors.push({
      row: rowNum,
      message: `Invalid date: "${createdAt || createdDate}"`,
    });
    return null;
  }

  // Parse symbol: "BTC-USDT" → base=BTC, quote=USDT
  const symbol = (row["symbol"] || "").toUpperCase().trim();
  const parts = symbol.split("-");
  if (parts.length !== 2) {
    errors.push({ row: rowNum, message: `Invalid symbol: "${symbol}"` });
    return null;
  }
  const [base, quote] = parts;

  const direction = (row["direction"] || row["side"] || "")
    .toLowerCase()
    .trim();
  const amount =
    safeParseNumber(row["amount"]) || safeParseNumber(row["quantity"]);
  const funds = safeParseNumber(row["funds"]) || safeParseNumber(row["total"]);
  const fee = safeParseNumber(row["fee"]);
  const feeCurrency = (row["fee_currency"] || row["feecurrency"] || "")
    .toUpperCase()
    .trim();

  if (!amount || amount <= 0) {
    errors.push({ row: rowNum, message: "Invalid amount" });
    return null;
  }

  const isBuy = direction === "buy";
  const isFiatQuote = FIAT_CURRENCIES.has(quote);

  const tx: ParsedTransaction = {
    type: isBuy ? "BUY" : "SELL",
    timestamp,
  };

  if (isBuy) {
    tx.receivedAsset = base;
    tx.receivedAmount = amount;
    tx.sentAsset = quote;
    tx.sentAmount = funds || 0;
    if (isFiatQuote && funds) {
      tx.receivedValueUsd = funds;
    }
  } else {
    tx.sentAsset = base;
    tx.sentAmount = amount;
    tx.receivedAsset = quote;
    tx.receivedAmount = funds || 0;
    if (isFiatQuote && funds) {
      tx.sentValueUsd = funds;
    }
  }

  // For crypto-to-crypto pairs, classify as TRADE
  if (!isFiatQuote) {
    tx.type = "TRADE";
  }

  if (fee && fee > 0) {
    tx.feeAmount = fee;
    tx.feeAsset = feeCurrency || quote;
    if (FIAT_CURRENCIES.has(tx.feeAsset)) {
      tx.feeValueUsd = fee;
    }
  }

  return tx;
}
