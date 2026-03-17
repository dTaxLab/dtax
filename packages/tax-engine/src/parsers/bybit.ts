/**
 * Bybit CSV Format Parser
 *
 * Handles Bybit's Spot Trade History export.
 * Common headers: Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time,Order Type
 * Alt headers: orderId,symbol,side,execPrice,execQty,execValue,execFee,feeCurrency,execTime
 *
 * Symbol format: "BTCUSDT", "ETHBTC" (no separator — CCXT-style concatenation)
 * Side: "Buy" or "Sell"
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
  "order time",
  "trade time",
  "exectime",
  "exec time",
  "time",
  "timestamp",
  "注文時間", // JA
  "下单时间", // ZH Simplified
  "下單時間", // ZH Traditional
  "주문 시간", // KO
];

const COL_SYMBOL = [
  "symbol",
  "trading pair",
  "pair",
  "銘柄", // JA
  "交易对", // ZH Simplified
  "交易對", // ZH Traditional
  "거래쌍", // KO
];

const COL_SIDE = [
  "side",
  "direction",
  "売買", // JA
  "方向", // ZH
  "유형", // KO
];

const COL_PRICE = [
  "avg. filled price",
  "filled price",
  "execprice",
  "exec price",
  "price",
  "平均約定価格", // JA
  "平均约定价格",
  "平均成交价", // ZH Simplified
  "平均成交價", // ZH Traditional
  "평균 체결 가격", // KO
];

const COL_QTY = [
  "filled qty",
  "execqty",
  "exec qty",
  "qty",
  "amount",
  "quantity",
  "約定数量", // JA
  "成交数量", // ZH Simplified
  "成交數量", // ZH Traditional
  "체결 수량", // KO
];

const COL_TOTAL = [
  "total",
  "execvalue",
  "exec value",
  "filled total",
  "funds",
  "合計", // JA
  "总额", // ZH Simplified
  "總額", // ZH Traditional
  "총액", // KO
];

const COL_FEE = [
  "fee",
  "execfee",
  "exec fee",
  "trading fee",
  "手数料", // JA
  "手续费", // ZH Simplified
  "手續費", // ZH Traditional
  "수수료", // KO
];

const COL_FEE_CURRENCY = [
  "fee currency",
  "feecurrency",
  "fee ccy",
  "手数料通貨", // JA
  "手续费币种", // ZH Simplified
  "手續費幣種", // ZH Traditional
  "수수료 통화", // KO
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
 * Detect if a CSV is in Bybit trade history format.
 */
export function isBybitCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  const norm = normalizeKey(firstLine);
  // Bybit-specific: "filled qty" or "execqty" plus "symbol" and ("side" or "direction")
  if (
    norm.includes("symbol") &&
    (norm.includes("side") || norm.includes("direction")) &&
    (norm.includes("filled qty") ||
      norm.includes("execqty") ||
      norm.includes("filled price") ||
      norm.includes("execprice") ||
      norm.includes("order no"))
  ) {
    return true;
  }
  // Japanese: "銘柄" + "売買" + "約定数量"
  if (
    norm.includes("銘柄") &&
    norm.includes("売買") &&
    norm.includes("約定数量")
  ) {
    return true;
  }
  // Chinese: "交易对"/"交易對" + "方向" + "成交数量"/"成交數量"
  if (
    (norm.includes("交易对") || norm.includes("交易對")) &&
    norm.includes("方向") &&
    (norm.includes("成交数量") || norm.includes("成交數量"))
  ) {
    return true;
  }
  return false;
}

/**
 * Split a Bybit concatenated symbol (e.g., "BTCUSDT") into [base, quote].
 */
function splitSymbol(symbol: string): [string, string] | null {
  const s = symbol.toUpperCase().trim();
  for (const quote of KNOWN_QUOTES) {
    if (s.endsWith(quote) && s.length > quote.length) {
      return [s.slice(0, -quote.length), quote];
    }
  }
  // Try hyphen or slash separator as fallback
  const parts = s.split(/[-\/]/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return [parts[0], parts[1]];
  }
  return null;
}

/**
 * Parse a Bybit Spot Trade History CSV.
 */
export function parseBybitCsv(csv: string): CsvParseResult {
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
      format: "bybit",
    },
  };
}

/** Parse a single Bybit trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Parse timestamp — multiple possible column names
  const tsRaw = resolveCol(row, COL_TIME);
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Parse symbol
  const symbolRaw = resolveCol(row, COL_SYMBOL).trim();
  const parsed = splitSymbol(symbolRaw);
  if (!parsed) {
    errors.push({ row: rowNum, message: `Invalid symbol: "${symbolRaw}"` });
    return null;
  }
  const [base, quote] = parsed;

  const side = resolveCol(row, COL_SIDE).toLowerCase().trim();
  const price = safeParseNumber(resolveCol(row, COL_PRICE));
  const qty = safeParseNumber(resolveCol(row, COL_QTY));
  const total = safeParseNumber(resolveCol(row, COL_TOTAL));
  const fee = safeParseNumber(resolveCol(row, COL_FEE));
  const feeCurrency = resolveCol(row, COL_FEE_CURRENCY).toUpperCase().trim();

  if (!qty || qty <= 0) {
    errors.push({ row: rowNum, message: "Invalid quantity" });
    return null;
  }

  // Multi-language buy/sell mapping
  const isBuy =
    side === "buy" ||
    side === "買い" ||
    side === "买入" ||
    side === "買入" ||
    side === "매수";

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
