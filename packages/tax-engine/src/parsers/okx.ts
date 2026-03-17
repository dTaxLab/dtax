/**
 * OKX CSV Format Parser
 *
 * Handles OKX's Trade History export:
 * Common headers: Order ID, Trade ID, Trade Time, Pair, Side, Price, Amount, Total, Fee, Fee Currency
 *
 * OKX pairs: "BTC-USDT", "ETH-BTC" (BASE-QUOTE with hyphen)
 * Side: "buy" or "sell"
 * Trade Time: ISO 8601 or "YYYY-MM-DD HH:mm:ss"
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
  "trade time",
  "tradetime",
  "time",
  "timestamp",
  "date",
  "交易时间",
  "交易時間", // ZH
  "取引時間",
  "約定時間", // JA
  "거래 시간", // KO
];

const COL_PAIR = [
  "pair",
  "instrument",
  "symbol",
  "交易对",
  "交易對",
  "币对",
  "幣對", // ZH
  "ペア",
  "通貨ペア",
  "銘柄", // JA
  "거래쌍", // KO
];

const COL_SIDE = [
  "side",
  "direction",
  "方向",
  "类型",
  "類型", // ZH
  "売買",
  "サイド", // JA
  "유형", // KO
];

const COL_AMOUNT = [
  "amount",
  "quantity",
  "filled qty",
  "数量",
  "數量",
  "成交量", // ZH
  "約定数量", // JA
  "수량", // KO
];

const COL_TOTAL = [
  "total",
  "funds",
  "filled amount",
  "总额",
  "總額",
  "成交额",
  "成交額", // ZH
  "合計",
  "約定額", // JA
  "총액", // KO
];

const COL_FEE = [
  "fee",
  "手续费",
  "手續費", // ZH
  "手数料", // JA
  "수수료", // KO
];

const COL_FEE_CURRENCY = [
  "fee currency",
  "feecurrency",
  "fee ccy",
  "手续费币种",
  "手續費幣種", // ZH
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
 * Detect if a CSV is in OKX trade history format.
 */
export function isOkxCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  const norm = normalizeKey(firstLine);
  // English: "pair"/"instrument" + "side" + "fee"/"total"
  if (
    (norm.includes("pair") || norm.includes("instrument")) &&
    norm.includes("side") &&
    (norm.includes("fee") || norm.includes("total"))
  ) {
    return true;
  }
  // Chinese Simplified: "交易对" + "方向" + "手续费"
  if (
    norm.includes("交易对") &&
    norm.includes("方向") &&
    norm.includes("手续费")
  )
    return true;
  // Chinese Traditional: "交易對" + "方向" + "手續費"
  if (
    norm.includes("交易對") &&
    norm.includes("方向") &&
    norm.includes("手續費")
  )
    return true;
  // Japanese: "ペア"/"通貨ペア" + "売買" + "手数料"
  if (
    (norm.includes("ペア") || norm.includes("通貨ペア")) &&
    norm.includes("売買") &&
    norm.includes("手数料")
  )
    return true;
  return false;
}

/**
 * Parse an OKX Trade History CSV.
 */
export function parseOkxCsv(csv: string): CsvParseResult {
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
      format: "okx",
    },
  };
}

/** Parse a single OKX trade row */
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

  // Parse pair: "BTC-USDT" or "BTC/USDT"
  const pair = resolveCol(row, COL_PAIR).toUpperCase().trim();
  const parts = pair.split(/[-\/]/);
  if (parts.length !== 2) {
    errors.push({ row: rowNum, message: `Invalid pair: "${pair}"` });
    return null;
  }
  const [base, quote] = parts;

  const side = resolveCol(row, COL_SIDE).toLowerCase().trim();
  const amount = safeParseNumber(resolveCol(row, COL_AMOUNT));
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
    side === "購入" ||
    side === "매수";
  const isSell =
    side === "sell" ||
    side === "卖出" ||
    side === "賣出" ||
    side === "売却" ||
    side === "매도";
  if (!isBuy && !isSell) {
    errors.push({ row: rowNum, message: `Unknown side: "${side}"` });
    return null;
  }
  const isFiatQuote = FIAT_CURRENCIES.has(quote);

  const tx: ParsedTransaction = {
    type: isFiatQuote ? (isBuy ? "BUY" : "SELL") : "TRADE",
    timestamp,
  };

  if (isBuy) {
    tx.receivedAsset = base;
    tx.receivedAmount = amount;
    tx.sentAsset = quote;
    tx.sentAmount = total || 0;
    if (isFiatQuote && total) tx.receivedValueUsd = total;
  } else {
    tx.sentAsset = base;
    tx.sentAmount = amount;
    tx.receivedAsset = quote;
    tx.receivedAmount = total || 0;
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
