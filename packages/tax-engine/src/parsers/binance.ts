/**
 * Binance CSV Format Parsers
 *
 * Supports two formats:
 * 1. Binance International — Trade History export (multi-language)
 *    EN: Date(UTC), Pair, Side, Price, Executed, Amount, Fee
 *    ZH: 时间, 交易对, 类型, 价格, 数量, 成交额, 手续费
 *    JA: 日時, ペア, 売買, 価格, 数量, 合計, 手数料
 *    KO: 날짜, 거래쌍, 유형, 가격, 수량, 총액, 수수료
 *    TR: Tarih, İşlem Çifti, Taraf, Fiyat, Miktar, Toplam, Komisyon
 *    ES: Fecha, Par, Lado, Precio, Ejecutado, Monto, Comisión
 *    PT: Data, Par, Lado, Preço, Executado, Valor, Taxa
 *    DE: Datum, Paar, Seite, Preis, Ausgeführt, Betrag, Gebühr
 *    FR: Date, Paire, Côté, Prix, Exécuté, Montant, Frais
 *    RU: Дата, Пара, Сторона, Цена, Исполнено, Сумма, Комиссия
 *    VI: Ngày, Cặp, Phía, Giá, Đã thực hiện, Số tiền, Phí
 *
 * 2. Binance US — Transaction History export
 *    Columns: Date, Type, Asset, Amount, Status, Balance, Fee
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

// ─── Multi-language column name mappings ────────────
// Each array lists all known translations for a semantic column.
// csv-core normalizes headers to lowercase + trim, so all entries are lowercase.

const COL_TIMESTAMP = [
  "date(utc)",
  "date (utc)",
  "date",
  "time",
  "时间", // ZH (Simplified)
  "時間", // ZH (Traditional)
  "日時",
  "日時(utc)", // JA
  "날짜",
  "시간",
  "일시", // KO
  "tarih", // TR
  "fecha", // ES
  "data", // PT
  "datum", // DE
  "дата", // RU
  "ngày", // VI
];

const COL_PAIR = [
  "pair",
  "market",
  "trading pair",
  "symbol",
  "交易对", // ZH (Simplified)
  "交易對", // ZH (Traditional)
  "ペア",
  "取引ペア",
  "通貨ペア", // JA
  "거래쌍",
  "거래 쌍", // KO
  "işlem çifti", // TR
  "par", // ES / PT
  "paire", // FR
  "paar", // DE
  "пара", // RU
  "cặp", // VI
];

const COL_SIDE = [
  "side",
  "type",
  "direction",
  "类型",
  "方向", // ZH (Simplified)
  "類型", // ZH (Traditional)
  "タイプ",
  "売買",
  "注文タイプ", // JA
  "유형",
  "종류",
  "매매구분", // KO
  "taraf",
  "yön", // TR
  "lado",
  "tipo", // ES / PT
  "côté", // FR
  "seite", // DE
  "сторона",
  "тип", // RU
  "phía",
  "loại", // VI
];

const COL_PRICE = [
  "price",
  "avg trading price",
  "trade price",
  "价格", // ZH (Simplified)
  "價格", // ZH (Traditional)
  "価格",
  "取引価格", // JA
  "가격", // KO
  "fiyat", // TR
  "precio", // ES
  "preço", // PT
  "preis", // DE
  "prix", // FR
  "цена", // RU
  "giá", // VI
];

const COL_EXECUTED = [
  "executed",
  "filled",
  "quantity",
  "qty",
  "数量", // ZH (Simplified)
  "數量", // ZH (Traditional)
  "数量",
  "約定数量", // JA
  "수량",
  "체결수량", // KO
  "miktar",
  "gerçekleşen", // TR
  "ejecutado",
  "cantidad", // ES
  "executado",
  "quantidade", // PT
  "ausgeführt",
  "menge", // DE
  "exécuté",
  "quantité", // FR
  "исполнено",
  "количество", // RU
  "đã thực hiện",
  "số lượng", // VI
];

const COL_TOTAL = [
  "total",
  "amount",
  "vol",
  "turnover",
  "成交额",
  "成交额 ", // ZH (Simplified, note trailing space variant)
  "成交額", // ZH (Traditional)
  "合計",
  "約定代金", // JA
  "총액",
  "거래대금", // KO
  "toplam",
  "tutar", // TR
  "monto",
  "total", // ES
  "montante",
  "valor", // PT
  "betrag",
  "gesamt", // DE
  "montant", // FR
  "сумма",
  "итого", // RU
  "số tiền",
  "tổng", // VI
];

const COL_FEE = [
  "fee",
  "commission",
  "trading fee",
  "手续费", // ZH (Simplified)
  "手續費", // ZH (Traditional)
  "手数料", // JA
  "수수료", // KO
  "komisyon",
  "ücret", // TR
  "comisión",
  "tarifa", // ES
  "taxa",
  "comissão", // PT
  "gebühr",
  "provision", // DE
  "frais", // FR
  "комиссия", // RU
  "phí", // VI
];

const COL_FEE_ASSET = [
  "fee coin",
  "fee asset",
  "fee currency",
  "手续费结算币种", // ZH (Simplified)
  "手續費結算幣種", // ZH (Traditional)
  "手数料通貨",
  "手数料コイン", // JA
  "수수료 통화",
  "수수료 코인", // KO
  "komisyon coin",
  "ücret coin", // TR
  "moneda comisión", // ES
  "moeda taxa", // PT
  "gebühr coin", // DE
  "devise frais", // FR
  "валюта комиссии", // RU
  "đồng phí", // VI
];

const COL_BASE_ASSET = [
  "base asset",
  "base coin",
  "base currency",
  "基准货币", // ZH (Simplified)
  "基準貨幣", // ZH (Traditional)
  "基軸通貨",
  "基準通貨", // JA
  "기준통화",
  "기준 통화", // KO
  "temel varlık", // TR
  "activo base",
  "moneda base", // ES
  "ativo base",
  "moeda base", // PT
  "basiswährung", // DE
  "actif de base", // FR
  "базовый актив",
  "базовая валюта", // RU
];

const COL_QUOTE_ASSET = [
  "quote asset",
  "quote coin",
  "quote currency",
  "计价货币", // ZH (Simplified)
  "計價貨幣", // ZH (Traditional)
  "決済通貨",
  "建値通貨", // JA
  "견적통화",
  "견적 통화",
  "호가통화", // KO
  "karşı varlık", // TR
  "activo cotizado",
  "moneda cotizada", // ES
  "ativo cotado",
  "moeda cotada", // PT
  "kurswährung", // DE
  "actif de cotation", // FR
  "котируемый актив",
  "котируемая валюта", // RU
];

// ─── Binance International ──────────────────────────

function mapBinanceSide(side: string): ParsedTransaction["type"] {
  const upper = side.toUpperCase().trim();
  if (upper === "BUY") return "BUY";
  if (upper === "SELL") return "SELL";
  // Multi-language buy/sell keywords
  const buyKeywords = [
    "买入",
    "買入",
    "購入", // ZH / JA
    "매수", // KO
    "aliş",
    "al", // TR
    "compra",
    "comprar", // ES / PT
    "achat",
    "acheter", // FR
    "kauf",
    "kaufen", // DE
    "покупка",
    "купить", // RU
    "mua", // VI
  ];
  const sellKeywords = [
    "卖出",
    "賣出",
    "売却", // ZH / JA
    "매도", // KO
    "satış",
    "sat", // TR
    "venta",
    "vender", // ES / PT
    "vente",
    "vendre", // FR
    "verkauf",
    "verkaufen", // DE
    "продажа",
    "продать", // RU
    "bán", // VI
  ];
  const lower = side.toLowerCase().trim();
  if (buyKeywords.includes(lower)) return "BUY";
  if (sellKeywords.includes(lower)) return "SELL";
  return "TRADE";
}

/**
 * Extract base and quote asset from a trading pair.
 * e.g., "BTCUSDT" → { base: "BTC", quote: "USDT" }
 */
function parsePair(pair: string): { base: string; quote: string } | null {
  const stablecoins = ["USDT", "USDC", "BUSD", "TUSD", "DAI", "FDUSD", "USD"];
  const fiats = ["USD", "EUR", "GBP", "JPY", "AUD", "BRL", "TRY"];
  const quoteAssets = [...stablecoins, ...fiats, "BTC", "ETH", "BNB"];

  const upper = pair.toUpperCase().replace(/[_/\-]/g, "");

  for (const quote of quoteAssets) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return {
        base: upper.slice(0, -quote.length),
        quote,
      };
    }
  }

  return null;
}

/**
 * Detect Binance International trade history CSV.
 * Supports headers in EN, ZH, JA, KO, TR, ES, PT, DE, FR, RU, VI.
 */
export function isBinanceCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0] || "";
  const lower = normalizeKey(firstLine.toLowerCase());

  // Strategy: English Binance uses the distinctive "date(utc)" header that no
  // other exchange uses. For non-English, we check language-specific column
  // name combinations that are unique to Binance exports.

  // 1) English: require "date(utc)" (distinctive) + "pair" + "side"
  const hasDateUtc =
    lower.includes("date(utc)") || lower.includes("date (utc)");
  if (hasDateUtc && lower.includes("pair") && lower.includes("side")) {
    return true;
  }

  // 2) Non-English: check for language-specific header combinations.
  //    Each combo uses at least 2 distinctive non-English column names.
  const LANG_COMBOS: [string, string][] = [
    // ZH-Simplified: 时间 + 交易对
    ["时间", "交易对"],
    // ZH-Traditional: 時間 + 交易對
    ["時間", "交易對"],
    // JA: 日時 + ペア or 売買
    ["日時", "ペア"],
    ["日時", "売買"],
    ["日時", "取引ペア"],
    // KO: 날짜 + 거래쌍
    ["날짜", "거래쌍"],
    ["일시", "거래쌍"],
    // TR: tarih + işlem çifti
    ["tarih", "işlem çifti"],
    // ES: fecha + par + lado (need all 3 to avoid false positives)
    ["fecha", "lado"],
    // PT: data + par + lado
    ["data", "lado"],
    // FR: paire + côté
    ["paire", "côté"],
    // DE: datum + paar
    ["datum", "paar"],
    // RU: дата + пара
    ["дата", "пара"],
    // VI: ngày + cặp
    ["ngày", "cặp"],
  ];

  for (const combo of LANG_COMBOS) {
    if (combo.every((term) => lower.includes(normalizeKey(term)))) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve base/quote from explicit columns or by parsing the pair string.
 * Supports multi-language base/quote asset column names.
 */
function resolvePair(
  row: Record<string, string>,
): { base: string; quote: string } | null {
  const baseCol = resolveCol(row, COL_BASE_ASSET);
  const quoteCol = resolveCol(row, COL_QUOTE_ASSET);
  if (baseCol && quoteCol) {
    return {
      base: baseCol.toUpperCase().trim(),
      quote: quoteCol.toUpperCase().trim(),
    };
  }
  // Fallback: parse pair string
  const pairStr = resolveCol(row, COL_PAIR);
  return parsePair(pairStr.replace(/\//g, ""));
}

/**
 * Parse Binance International trade history CSV.
 * Supports column headers in 11 languages:
 * EN, ZH, ZH-Hant, JA, KO, TR, ES, PT, DE, FR, RU, VI.
 */
export function parseBinanceCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tsRaw = resolveCol(row, COL_TIMESTAMP);
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      const pair = resolvePair(row);
      if (!pair) {
        errors.push({
          row: rowNum,
          message: `Cannot parse pair from row`,
        });
        continue;
      }

      const side = resolveCol(row, COL_SIDE);
      const type = mapBinanceSide(side);

      const executed = safeParseNumber(resolveCol(row, COL_EXECUTED));
      const price = safeParseNumber(resolveCol(row, COL_PRICE));
      const total = safeParseNumber(resolveCol(row, COL_TOTAL));
      const fee = safeParseNumber(resolveCol(row, COL_FEE));

      const tx: ParsedTransaction = {
        type,
        timestamp,
      };

      if (type === "BUY") {
        tx.receivedAsset = pair.base;
        tx.receivedAmount = executed;
        tx.receivedValueUsd =
          total || (executed && price ? executed * price : undefined);
        tx.sentAsset = pair.quote;
        tx.sentAmount = total;
      } else {
        tx.sentAsset = pair.base;
        tx.sentAmount = executed;
        tx.sentValueUsd =
          total || (executed && price ? executed * price : undefined);
        tx.receivedAsset = pair.quote;
        tx.receivedAmount = total;
      }

      if (fee && fee > 0) {
        tx.feeAmount = fee;
        const feeAssetRaw = resolveCol(row, COL_FEE_ASSET);
        tx.feeAsset = feeAssetRaw.toUpperCase().trim() || pair.quote;
      }

      transactions.push(tx);
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return {
    transactions,
    errors,
    summary: {
      totalRows: objects.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "binance",
    },
  };
}

// ─── Binance US ─────────────────────────────────────

function mapBinanceUsType(raw: string): ParsedTransaction["type"] {
  const map: Record<string, ParsedTransaction["type"]> = {
    buy: "BUY",
    sell: "SELL",
    trade: "TRADE",
    deposit: "TRANSFER_IN",
    withdrawal: "TRANSFER_OUT",
    "staking rewards": "STAKING_REWARD",
    "staking reward": "STAKING_REWARD",
    distribution: "AIRDROP",
    "referral commission": "INTEREST",
    interest: "INTEREST",
    send: "TRANSFER_OUT",
    receive: "TRANSFER_IN",
  };
  return map[raw.toLowerCase().trim()] || "UNKNOWN";
}

/**
 * Detect Binance US CSV format.
 */
export function isBinanceUsCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  // Binance US uses "Date" without "(UTC)" and has "Status" + "Balance" columns
  return (
    firstLine.includes("date") &&
    firstLine.includes("status") &&
    firstLine.includes("balance") &&
    !firstLine.includes("pair")
  );
}

/**
 * Parse Binance US transaction history CSV.
 */
export function parseBinanceUsCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tsRaw = row["date"] || row["timestamp"] || "";
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      const rawType = row["type"] || row["transaction type"] || "";
      const type = mapBinanceUsType(rawType);
      const asset = (row["asset"] || row["coin"] || "").toUpperCase();
      const amount = safeParseNumber(row["amount"] || row["quantity"]);
      const fee = safeParseNumber(row["fee"] || row["commission"]);

      if (!asset) {
        errors.push({ row: rowNum, message: "Missing asset" });
        continue;
      }

      const isBuy = [
        "BUY",
        "TRANSFER_IN",
        "STAKING_REWARD",
        "AIRDROP",
        "INTEREST",
      ].includes(type);

      const tx: ParsedTransaction = {
        type,
        timestamp,
      };

      if (isBuy) {
        tx.receivedAsset = asset;
        tx.receivedAmount = amount ? Math.abs(amount) : undefined;
      } else {
        tx.sentAsset = asset;
        tx.sentAmount = amount ? Math.abs(amount) : undefined;
      }

      if (fee && fee > 0) {
        tx.feeAmount = fee;
        tx.feeAsset = asset;
      }

      transactions.push(tx);
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return {
    transactions,
    errors,
    summary: {
      totalRows: objects.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "binance",
    },
  };
}
