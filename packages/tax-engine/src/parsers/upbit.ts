/**
 * Upbit CSV Format Parser
 *
 * Handles Upbit's order history export (Korean exchange).
 *
 * Korean headers:
 *   주문일시,마켓,종류,수량,가격,주문금액,수수료,거래금액
 *   (OrderDateTime, Market, Type, Quantity, Price, OrderAmount, Fee, TradedAmount)
 *
 * Market format: "KRW-BTC", "BTC-XRP", "USDT-ETH" (QUOTE-BASE)
 * Type: "매수" (Buy), "매도" (Sell)
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

const FIAT_CURRENCIES = new Set(["KRW", "USD", "USDT", "USDC"]);

/**
 * Split an Upbit market like "KRW-BTC" → [quote="KRW", base="BTC"].
 */
function splitUpbitMarket(
  market: string,
): { base: string; quote: string } | null {
  const parts = market.toUpperCase().trim().split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { quote: parts[0], base: parts[1] };
}

/** Map Upbit trade type to DTax type */
function mapUpbitType(
  typeKr: string,
): "BUY" | "SELL" | "TRANSFER_IN" | "TRANSFER_OUT" | null {
  const t = typeKr.trim();
  if (t === "매수" || t === "buy" || t.toLowerCase() === "buy") return "BUY";
  if (t === "매도" || t === "sell" || t.toLowerCase() === "sell") return "SELL";
  if (t === "입금" || t.toLowerCase() === "deposit") return "TRANSFER_IN";
  if (t === "출금" || t.toLowerCase() === "withdrawal") return "TRANSFER_OUT";
  return null;
}

/**
 * Detect if a CSV is in Upbit format.
 * Unique: Korean "주문일시" (OrderDateTime) column OR "마켓" (Market) with KRW- prefix in data.
 */
export function isUpbitCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0] || "";
  const lower = firstLine.toLowerCase();
  // Korean header markers
  if (firstLine.includes("주문일시") && firstLine.includes("마켓")) return true;
  // English export variant
  if (
    lower.includes("market") &&
    lower.includes("order") &&
    // KRW market in first data row
    csv.includes("KRW-")
  ) {
    return true;
  }
  return false;
}

/**
 * Parse an Upbit order history CSV.
 */
export function parseUpbitCsv(csv: string): CsvParseResult {
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
      format: "upbit",
    },
  };
}

function parseRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Timestamp — "주문일시" or "orderdatetime" (parseCsvToObjects lowercases keys)
  const tsRaw =
    row["주문일시"] ||
    row["orderdatetime"] ||
    row["order date time"] ||
    row["date"] ||
    "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Market — "마켓" or "market"
  const marketRaw = (row["마켓"] || row["market"] || "").trim();
  const market = splitUpbitMarket(marketRaw);
  if (!market) {
    errors.push({ row: rowNum, message: `Invalid market: "${marketRaw}"` });
    return null;
  }
  const { base, quote } = market;

  // Type — "종류" or "type"
  const typeRaw = row["종류"] || row["type"] || row["side"] || "";
  const txType = mapUpbitType(typeRaw);
  if (!txType) {
    errors.push({ row: rowNum, message: `Unknown type: "${typeRaw}"` });
    return null;
  }

  // Quantities — "수량" (quantity), "거래금액" (traded amount in quote)
  const quantity = safeParseNumber(
    row["수량"] || row["quantity"] || row["체결수량"] || "",
  );
  const tradedAmount = safeParseNumber(
    row["거래금액"] || row["tradedamount"] || row["주문금액"] || "",
  );

  if (!quantity || quantity <= 0) {
    errors.push({ row: rowNum, message: "Invalid quantity" });
    return null;
  }

  // Fee — "수수료" or "fee"
  const fee = safeParseNumber(row["수수료"] || row["fee"] || "");
  const isFiatQuote = FIAT_CURRENCIES.has(quote);

  const tx: ParsedTransaction = {
    type:
      txType === "BUY"
        ? isFiatQuote
          ? "BUY"
          : "TRADE"
        : isFiatQuote
          ? "SELL"
          : "TRADE",
    timestamp,
  };

  if (txType === "BUY") {
    tx.receivedAsset = base;
    tx.receivedAmount = quantity;
    if (tradedAmount) {
      tx.sentAsset = quote;
      tx.sentAmount = tradedAmount;
      if (isFiatQuote) tx.receivedValueUsd = tradedAmount;
    }
  } else {
    tx.sentAsset = base;
    tx.sentAmount = quantity;
    if (tradedAmount) {
      tx.receivedAsset = quote;
      tx.receivedAmount = tradedAmount;
      if (isFiatQuote) tx.sentValueUsd = tradedAmount;
    }
  }

  if (fee && Math.abs(fee) > 0) {
    tx.feeAmount = Math.abs(fee);
    // Upbit typically charges fee in quote currency
    tx.feeAsset = quote;
    if (FIAT_CURRENCIES.has(quote)) {
      tx.feeValueUsd = Math.abs(fee);
    }
  }

  return tx;
}
