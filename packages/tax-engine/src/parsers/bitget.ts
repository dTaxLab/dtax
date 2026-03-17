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
import { normalizeKey, resolveCol } from "./col-resolver";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/* ── Column name candidates (lowercase — csv-core lowercases headers) ── */

const COL_TIME = [
  "order time",
  "trade time",
  "ctime",
  "time",
  "timestamp",
  "date",
  "下单时间", // ZH Simplified
  "下單時間", // ZH Traditional
  "注文時間", // JA
  "주문 시간", // KO
];

const COL_SYMBOL = [
  "trading pair",
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
  "方向", // ZH
  "売買", // JA
  "유형", // KO
];

const COL_PRICE = [
  "filled price",
  "priceavg",
  "price avg",
  "price",
  "avg. filled price",
  "成交价", // ZH Simplified
  "成交價", // ZH Traditional
  "約定価格", // JA
  "체결 가격", // KO
];

const COL_QTY = [
  "filled amount",
  "size",
  "basevolume",
  "base volume",
  "qty",
  "amount",
  "成交量", // ZH Simplified
  "成交數量", // ZH Traditional
  "約定数量", // JA
  "체결 수량", // KO
];

const COL_TOTAL = [
  "total",
  "quotevolume",
  "quote volume",
  "value",
  "funds",
  "总额", // ZH Simplified
  "總額", // ZH Traditional
  "合計", // JA
  "총액", // KO
];

const COL_FEE = [
  "fee",
  "手续费", // ZH Simplified
  "手續費", // ZH Traditional
  "手数料", // JA
  "수수료", // KO
];

const COL_FEE_CURRENCY = [
  "fee currency",
  "feecurrency",
  "fee ccy",
  "手续费币种", // ZH Simplified
  "手續費幣種", // ZH Traditional
  "手数料通貨", // JA
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
 * Detect if a CSV is in Bitget trade history format.
 */
export function isBitgetCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  const norm = normalizeKey(firstLine);
  // Bitget-specific: "trading pair" or ("priceavg"/"basevolume") plus "side"
  if (
    norm.includes("trading pair") &&
    norm.includes("side") &&
    (norm.includes("filled") || norm.includes("total"))
  )
    return true;
  if (norm.includes("priceavg") && norm.includes("basevolume")) return true;
  if (
    norm.includes("symbol") &&
    norm.includes("side") &&
    norm.includes("quotevolume")
  )
    return true;
  // Chinese: "交易对"/"交易對" + "方向" + "成交量" + "下单时间"/"下單時間"
  if (
    (norm.includes("交易对") || norm.includes("交易對")) &&
    norm.includes("方向") &&
    (norm.includes("成交量") || norm.includes("成交數量")) &&
    (norm.includes("下单时间") || norm.includes("下單時間"))
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
  const tsRaw = resolveCol(row, COL_TIME);

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
    side === "买入" ||
    side === "買入" ||
    side === "買い" ||
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
