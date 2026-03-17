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
import { normalizeKey, resolveCol } from "./col-resolver";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/* ── Column name candidates (lowercase — csv-core lowercases headers) ── */

const COL_TIME = [
  "date",
  "create_time",
  "time",
  "timestamp",
  "日期", // ZH Simplified
  "日期", // ZH Traditional (same)
  "日時", // JA
  "날짜", // KO
];

const COL_PAIR = [
  "pair",
  "currency_pair",
  "symbol",
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

const COL_AMOUNT = [
  "filled amount",
  "amount",
  "qty",
  "quantity",
  "成交量", // ZH Simplified
  "成交數量", // ZH Traditional
  "約定数量", // JA
  "체결 수량", // KO
];

const COL_PRICE = [
  "filled price",
  "price",
  "avg. filled price",
  "成交价", // ZH Simplified
  "成交價", // ZH Traditional
  "約定価格", // JA
  "체결 가격", // KO
];

const COL_TOTAL = [
  "total",
  "funds",
  "value",
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
  "fee_currency",
  "feecurrency",
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

/**
 * Detect if a CSV is in Gate.io trade history format.
 */
export function isGateCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  const norm = normalizeKey(firstLine);
  // Gate.io: has "currency_pair" or ("pair" + "role"), plus "side" or "fee"
  if (norm.includes("currency_pair") && norm.includes("side")) return true;
  if (
    norm.includes("pair") &&
    norm.includes("role") &&
    (norm.includes("filled price") || norm.includes("filled amount"))
  )
    return true;
  // Chinese: "交易对"/"交易對" + "角色" + "成交价"/"成交價"
  if (
    (norm.includes("交易对") || norm.includes("交易對")) &&
    norm.includes("角色") &&
    (norm.includes("成交价") || norm.includes("成交價"))
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
  const tsRaw = resolveCol(row, COL_TIME);
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  // Parse pair: "BTC_USDT" or "BTC/USDT" or "BTC-USDT"
  const pairRaw = resolveCol(row, COL_PAIR).toUpperCase().trim();
  const parts = pairRaw.split(/[_\-\/]/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    errors.push({ row: rowNum, message: `Invalid pair: "${pairRaw}"` });
    return null;
  }
  const [base, quote] = parts;

  const side = resolveCol(row, COL_SIDE).toLowerCase().trim();
  const amount = safeParseNumber(resolveCol(row, COL_AMOUNT));
  const price = safeParseNumber(resolveCol(row, COL_PRICE));
  const total = safeParseNumber(resolveCol(row, COL_TOTAL));
  const fee = safeParseNumber(resolveCol(row, COL_FEE));
  const feeCurrency = resolveCol(row, COL_FEE_CURRENCY).toUpperCase().trim();

  if (!amount || amount <= 0) {
    errors.push({ row: rowNum, message: "Invalid amount" });
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
