/**
 * HTX (formerly Huobi) CSV Format Parser
 *
 * Handles HTX/Huobi's Spot Trade History export.
 * Standard headers: Time, Pair, Side, Price, Amount, Total, Fee, Fee Currency, Role
 * API-style: order-id, symbol, type, price, filled-amount, filled-fees, fee-deduct-currency, role, created-at
 *
 * Symbol format: "btcusdt" (lowercase concatenated) or "BTC/USDT"
 * Side: "Buy"/"Sell" or type: "buy-limit"/"sell-market"/etc.
 * Time: "YYYY-MM-DD HH:mm:ss" or Unix ms
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import { resolveCol } from "./col-resolver";
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

/* ── Column name candidates (EN + JA + ZH) ── */
const COL_TIME = [
  "time",
  "created-at",
  "created_at",
  "createdat",
  "timestamp",
  "date",
  "時間",
  "时间",
];
const COL_PAIR = [
  "pair",
  "symbol",
  "trading pair",
  "通貨ペア",
  "ペア",
  "交易对",
];
const COL_SIDE = [
  "side",
  "direction",
  "type",
  "売／買",
  "売買",
  "タイプ",
  "方向",
  "类型",
];
const COL_PRICE = ["price", "avg price", "average price", "価格", "价格"];
const COL_AMOUNT = [
  "amount",
  "filled-amount",
  "filled amount",
  "filledamount",
  "quantity",
  "qty",
  "数量",
];
const COL_TOTAL = [
  "total",
  "turnover",
  "filled-cash-amount",
  "filledcashamount",
  "約定額",
  "合計",
  "成交额",
];
const COL_FEE = [
  "fee",
  "filled-fees",
  "filledfees",
  "filled fees",
  "trading fee",
  "手数料",
  "手续费",
];
const COL_FEE_CURRENCY = [
  "fee currency",
  "fee-deduct-currency",
  "feedeductcurrency",
  "fee ccy",
  "手数料通貨",
  "手续费币种",
];

/**
 * Detect if a CSV is in HTX/Huobi trade history format.
 */
export function isHtxCsv(csv: string): boolean {
  const rawFirstLine = csv.split("\n")[0] || "";
  const firstLine = rawFirstLine.toLowerCase();
  // HTX standard: "pair" + "side" + "fee currency" + exclude other exchanges
  // Exclude: "currency pair" (Gate.io), "pairs" (MEXC), "trading pair" (Bitget),
  //          "trade id"/"order id" (OKX), "filled price" (Gate.io/Bybit)
  if (
    firstLine.includes("pair") &&
    firstLine.includes("side") &&
    firstLine.includes("fee currency") &&
    !firstLine.includes("currency pair") &&
    !firstLine.includes("currency_pair") &&
    !firstLine.includes("pairs") &&
    !firstLine.includes("trading pair") &&
    !firstLine.includes("trade id") &&
    !firstLine.includes("order id") &&
    !firstLine.includes("filled price")
  ) {
    return true;
  }
  // HTX API-style: "filled-amount" or "filled-fees" (hyphenated — unique to Huobi API)
  if (
    firstLine.includes("filled-amount") ||
    firstLine.includes("filled-fees")
  ) {
    return true;
  }
  // HTX API-style: "fee-deduct-currency" (unique to Huobi)
  if (firstLine.includes("fee-deduct-currency")) {
    return true;
  }
  // JA: HTX Japan (BitTrade) — 時間 + 通貨ペア
  if (rawFirstLine.includes("時間") && rawFirstLine.includes("通貨ペア"))
    return true;
  // JA: 時間 + 売／買 (alternate)
  if (rawFirstLine.includes("時間") && rawFirstLine.includes("売／買"))
    return true;
  // ZH: 时间 + 交易对 + 方向 (exclude OKX which has 订单ID/交易ID)
  if (
    rawFirstLine.includes("时间") &&
    rawFirstLine.includes("交易对") &&
    rawFirstLine.includes("方向") &&
    !rawFirstLine.includes("订单") &&
    !rawFirstLine.includes("交易ID")
  )
    return true;
  return false;
}

/**
 * Split an HTX symbol (e.g., "btcusdt" or "BTC/USDT") into [base, quote].
 */
function splitSymbol(symbol: string): [string, string] | null {
  const s = symbol.toUpperCase().trim();
  // Try common separators first
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
 * Parse HTX's type field (e.g., "buy-limit", "sell-market") into side.
 * Also handles Japanese 買/売 and Chinese 买入/卖出.
 */
function parseSide(row: Record<string, string>): "buy" | "sell" | null {
  const raw = resolveCol(row, COL_SIDE).trim();
  const lower = raw.toLowerCase();
  if (lower === "buy" || lower === "sell") return lower;

  // API format: type field like "buy-limit", "sell-market", "buy-market", "sell-limit"
  if (lower.startsWith("buy")) return "buy";
  if (lower.startsWith("sell")) return "sell";

  // JA: 買 = buy, 売 = sell
  if (raw.includes("買")) return "buy";
  if (raw.includes("売")) return "sell";

  // ZH: 买 = buy, 卖 = sell
  if (raw.includes("买")) return "buy";
  if (raw.includes("卖")) return "sell";

  return null;
}

/**
 * Parse an HTX/Huobi Spot Trade History CSV.
 */
export function parseHtxCsv(csv: string): CsvParseResult {
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
      format: "htx",
    },
  };
}

/** Parse a single HTX trade row */
function parseTradeRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Parse timestamp
  const tsRaw = resolveCol(row, COL_TIME);
  let timestamp: string | null = null;

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
  const symbolRaw = resolveCol(row, COL_PAIR).trim();
  const parsed = splitSymbol(symbolRaw);
  if (!parsed) {
    errors.push({ row: rowNum, message: `Invalid symbol: "${symbolRaw}"` });
    return null;
  }
  const [base, quote] = parsed;

  // Determine side
  const side = parseSide(row);
  if (!side) {
    errors.push({ row: rowNum, message: "Missing side/direction" });
    return null;
  }
  const isBuy = side === "buy";

  const price = safeParseNumber(resolveCol(row, COL_PRICE));
  const qty = safeParseNumber(resolveCol(row, COL_AMOUNT));
  const total = safeParseNumber(resolveCol(row, COL_TOTAL));
  const fee = safeParseNumber(resolveCol(row, COL_FEE));
  const feeCurrency = resolveCol(row, COL_FEE_CURRENCY).toUpperCase().trim();

  if (!qty || qty <= 0) {
    errors.push({ row: rowNum, message: "Invalid quantity" });
    return null;
  }

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
