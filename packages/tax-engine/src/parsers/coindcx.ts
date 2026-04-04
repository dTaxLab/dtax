/**
 * CoinDCX CSV Format Parser
 *
 * Handles CoinDCX trade history export:
 * Order ID, Date, Market, Type, Price (INR), Amount, Total (INR), Status, Fee, Fee Currency
 *
 * @license AGPL-3.0
 */

import { parseCsvRows, safeParseNumber, safeParseDateToIso } from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

function mapCoinDCXType(raw: string): ParsedTransaction["type"] {
  const map: Record<string, ParsedTransaction["type"]> = {
    buy:        "BUY",
    sell:       "SELL",
    deposit:    "TRANSFER_IN",
    withdrawal: "TRANSFER_OUT",
  };
  return map[raw.toLowerCase().trim()] ?? "UNKNOWN";
}

export function isCoinDCXCsv(csv: string): boolean {
  const first = csv.split("\n")[0]?.toLowerCase() ?? "";
  return first.includes("order id") && first.includes("market") && first.includes("price (inr)");
}

export function parseCoinDCXCsv(csv: string): CsvParseResult {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) {
    return { transactions: [], errors: [], summary: { totalRows: 0, parsed: 0, failed: 0, format: "coindcx" } };
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const idx = {
    date:    header.indexOf("date"),
    market:  header.indexOf("market"),
    type:    header.indexOf("type"),
    price:   header.findIndex((h) => h.includes("price")),
    amount:  header.indexOf("amount"),
    total:   header.findIndex((h) => h.includes("total")),
    fee:     header.indexOf("fee"),
    feeCurr: header.indexOf("fee currency"),
  };

  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];
  const dataRows = rows.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      const rawType = idx.type >= 0 ? (row[idx.type] ?? "") : "";
      const txType = mapCoinDCXType(rawType);

      // Market format: "BTCINR" or "BTC/INR" — extract base asset
      const market = idx.market >= 0 ? (row[idx.market] ?? "").trim() : "";
      const baseAsset = market.replace(/[\/]?INR$/i, "").trim();

      const isBuy = txType === "BUY";
      const amount = idx.amount >= 0 ? safeParseNumber(row[idx.amount]) : undefined;
      const totalInr = idx.total >= 0 ? safeParseNumber(row[idx.total]) : undefined;

      const feeAmount = idx.fee >= 0 ? safeParseNumber(row[idx.fee]) : undefined;
      const feeAsset = idx.feeCurr >= 0 ? (row[idx.feeCurr] ?? "").trim() || undefined : undefined;

      transactions.push({
        timestamp: idx.date >= 0 ? (safeParseDateToIso(row[idx.date] ?? "") ?? "") : "",
        type: txType,
        receivedAsset: isBuy ? baseAsset : "INR",
        receivedAmount: isBuy ? amount : totalInr,
        sentAsset: isBuy ? "INR" : baseAsset,
        sentAmount: isBuy ? totalInr : amount,
        feeAmount,
        feeAsset,
        notes: totalInr != null ? `INR total: ${totalInr}` : undefined,
      });
    } catch (e) {
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    transactions,
    errors,
    summary: { totalRows: dataRows.length, parsed: transactions.length, failed: errors.length, format: "coindcx" },
  };
}
