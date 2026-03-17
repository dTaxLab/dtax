/**
 * MEXC CSV Format Parser
 *
 * Handles MEXC's Spot Trade History export.
 * Standard headers: Pairs, Time, Side, Filled Price, Executed Amount, Total, Fee, Role
 * API-style: symbol, id, orderId, price, qty, quoteQty, commission, commissionAsset, time, isBuyerMaker
 *
 * Symbol format: "BTC_USDT" (underscore) or "BTCUSDT" (concatenated)
 * Side: "BUY" or "SELL"
 * Fee: concatenated like "0.5USDT" (needs regex parsing) or separate commission+commissionAsset
 * Time header may include timezone: "Time(UTC+08:00)"
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import { normalizeKey, resolveCol } from "./col-resolver";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/* ── Column name candidates (lowercase — csv-core lowercases headers) ── */

const COL_TIME = [
  "time",
  "timestamp",
  "trade time",
  "ctime",
  "时间", // ZH Simplified
  "時間", // ZH Traditional / JA
  "거래 시간", // KO
];

const COL_SYMBOL = [
  "pairs",
  "symbol",
  "pair",
  "交易对", // ZH Simplified
  "交易對", // ZH Traditional
  "銘柄", // JA
  "거래쌍", // KO
];

const COL_SIDE = [
  "side",
  "direction",
  "type",
  "方向", // ZH
  "売買", // JA
  "유형", // KO
];

const COL_PRICE = [
  "filled price",
  "price",
  "average filled price",
  "成交价", // ZH Simplified
  "成交價", // ZH Traditional
  "約定価格", // JA
  "체결 가격", // KO
];

const COL_QTY = [
  "executed amount",
  "filled quantity",
  "qty",
  "amount",
  "成交量", // ZH Simplified
  "成交量", // ZH Traditional (same)
  "約定数量", // JA
  "체결 수량", // KO
];

const COL_TOTAL = [
  "total",
  "quoteqty",
  "order amount",
  "总额", // ZH Simplified
  "總額", // ZH Traditional
  "合計", // JA
  "총액", // KO
];

const COL_FEE = [
  "fee",
  "trading fee",
  "手续费", // ZH Simplified
  "手續費", // ZH Traditional
  "手数料", // JA
  "수수료", // KO
];

const COL_COMMISSION = [
  "commission",
  "佣金", // ZH
  "コミッション", // JA
];

const COL_COMMISSION_ASSET = [
  "commissionasset",
  "佣金币种", // ZH
  "コミッション通貨", // JA
];

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
 * Detect if a CSV is in MEXC trade history format.
 */
export function isMexcCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  const norm = normalizeKey(firstLine);
  // MEXC standard: "pairs" + "side" + ("filled price" or "executed amount")
  if (
    norm.includes("pairs") &&
    norm.includes("side") &&
    (norm.includes("filled price") || norm.includes("executed amount"))
  ) {
    return true;
  }
  // MEXC API-style: "symbol" + "commissionasset" (unique to MEXC API)
  if (norm.includes("symbol") && norm.includes("commissionasset")) {
    return true;
  }
  // MEXC API alt: "symbol" + "isbuyermaker"
  if (norm.includes("symbol") && norm.includes("isbuyermaker")) {
    return true;
  }
  // Chinese: "交易对" + "成交价" + "成交量"
  if (
    (norm.includes("交易对") || norm.includes("交易對")) &&
    (norm.includes("成交价") || norm.includes("成交價")) &&
    norm.includes("成交量")
  ) {
    return true;
  }
  return false;
}

/**
 * Split a MEXC symbol (e.g., "BTC_USDT" or "BTCUSDT") into [base, quote].
 */
function splitSymbol(symbol: string): [string, string] | null {
  const s = symbol.toUpperCase().trim();
  // Try underscore separator first (MEXC futures/common format)
  const underscoreParts = s.split("_");
  if (
    underscoreParts.length === 2 &&
    underscoreParts[0] &&
    underscoreParts[1]
  ) {
    return [underscoreParts[0], underscoreParts[1]];
  }
  // Try hyphen or slash separator
  const sepParts = s.split(/[-\/]/);
  if (sepParts.length === 2 && sepParts[0] && sepParts[1]) {
    return [sepParts[0], sepParts[1]];
  }
  // Concatenated: try KNOWN_QUOTES from right
  for (const quote of KNOWN_QUOTES) {
    if (s.endsWith(quote) && s.length > quote.length) {
      return [s.slice(0, -quote.length), quote];
    }
  }
  return null;
}

/**
 * Parse MEXC's concatenated fee field (e.g., "0.5USDT", "0.001BTC").
 * Returns [amount, asset] or null.
 */
function parseConcatenatedFee(fee: string): [number, string] | null {
  if (!fee) return null;
  const match = fee.trim().match(/^(-?\d+(?:\.\d+)?)([A-Za-z]+)$/);
  if (match) {
    const amount = parseFloat(match[1]);
    const asset = match[2].toUpperCase();
    return [amount, asset];
  }
  return null;
}

/**
 * Parse a MEXC Spot Trade History CSV.
 */
export function parseMexcCsv(csv: string): CsvParseResult {
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
      format: "mexc",
    },
  };
}

/**
 * Find a column value, checking for timezone-suffixed variants like "time(utc+08:00)".
 * Also checks Chinese/Japanese time column names via resolveCol.
 */
function findTimeColumn(row: Record<string, string>): string {
  // First try resolveCol for standard + i18n names
  const resolved = resolveCol(row, COL_TIME);
  if (resolved) return resolved;
  // Look for time(...) pattern in keys
  for (const key of Object.keys(row)) {
    if (key.startsWith("time(")) {
      return row[key];
    }
  }
  return "";
}

/** Parse a single MEXC trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Parse timestamp
  const tsRaw = findTimeColumn(row);
  let timestamp: string | null = null;

  // Handle Unix ms timestamp
  const tsNum = Number(tsRaw);
  if (!isNaN(tsNum) && tsNum > 1e12) {
    timestamp = new Date(tsNum).toISOString();
  } else {
    timestamp = safeParseDateToIso(tsRaw);
  }

  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Parse symbol/pair
  const symbolRaw = resolveCol(row, COL_SYMBOL).trim();
  const parsed = splitSymbol(symbolRaw);
  if (!parsed) {
    errors.push({ row: rowNum, message: `Invalid symbol: "${symbolRaw}"` });
    return null;
  }
  const [base, quote] = parsed;

  // Determine side — standard "side" or API "isbuyermaker"
  let isBuy: boolean;
  const sideRaw = resolveCol(row, COL_SIDE).toLowerCase().trim();
  if (sideRaw) {
    // Multi-language buy/sell mapping
    isBuy =
      sideRaw === "buy" ||
      sideRaw === "买入" ||
      sideRaw === "買入" ||
      sideRaw === "買い" ||
      sideRaw === "매수";
  } else if (row["isbuyermaker"] !== undefined) {
    // API format: isBuyerMaker=true means buyer was maker, the taker sold
    // But from the user's perspective exporting their own trades, this indicates their side
    // For simplicity: isBuyerMaker=true → this user placed the buy order as maker
    isBuy = row["isbuyermaker"] === "true";
  } else {
    errors.push({ row: rowNum, message: "Missing side/direction" });
    return null;
  }

  const price = safeParseNumber(resolveCol(row, COL_PRICE));
  const qty = safeParseNumber(resolveCol(row, COL_QTY));
  const total = safeParseNumber(resolveCol(row, COL_TOTAL));

  if (!qty || qty <= 0) {
    errors.push({ row: rowNum, message: "Invalid quantity" });
    return null;
  }

  const isFiatQuote = FIAT_CURRENCIES.has(quote);
  const computedTotal = total || (price ? price * qty : 0);

  // Parse fee — concatenated format "0.5USDT" or separate commission+commissionAsset
  let feeAmount: number | undefined;
  let feeAsset: string | undefined;

  const commissionRaw = resolveCol(row, COL_COMMISSION);
  const commissionAssetRaw = resolveCol(row, COL_COMMISSION_ASSET);
  if (commissionRaw && commissionAssetRaw) {
    // API-style: separate fields
    const feeVal = safeParseNumber(commissionRaw);
    if (feeVal && Math.abs(feeVal) > 0) {
      feeAmount = Math.abs(feeVal);
      feeAsset = commissionAssetRaw.toUpperCase().trim();
    }
  } else {
    // Standard: concatenated "0.5USDT"
    const feeRaw = resolveCol(row, COL_FEE);
    const parsedFee = parseConcatenatedFee(feeRaw);
    if (parsedFee && Math.abs(parsedFee[0]) > 0) {
      feeAmount = Math.abs(parsedFee[0]);
      feeAsset = parsedFee[1];
    }
  }

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

  if (feeAmount) {
    tx.feeAmount = feeAmount;
    tx.feeAsset = feeAsset || quote;
    if (FIAT_CURRENCIES.has(tx.feeAsset)) {
      tx.feeValueUsd = feeAmount;
    }
  }

  return tx;
}
