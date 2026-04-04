/**
 * WazirX CSV Format Parser
 *
 * Handles WazirX trade history export:
 * Date, Market, Type, Buy, Buy Unit, Buy-Value(INR), Sell, Sell Unit, Sell-Value(INR), Fee, Fee Unit, Fee-Value(INR)
 *
 * @license AGPL-3.0
 */

import { parseCsvRows, safeParseNumber, safeParseDateToIso } from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

function mapWazirXType(raw: string): ParsedTransaction["type"] {
  const map: Record<string, ParsedTransaction["type"]> = {
    buy:      "BUY",
    sell:     "SELL",
    deposit:  "TRANSFER_IN",
    withdraw: "TRANSFER_OUT",
  };
  return map[raw.toLowerCase().trim()] ?? "UNKNOWN";
}

export function isWazirXCsv(csv: string): boolean {
  const first = csv.split("\n")[0]?.toLowerCase() ?? "";
  return first.includes("buy unit") && first.includes("sell unit") && first.includes("market");
}

export function parseWazirXCsv(csv: string): CsvParseResult {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) {
    return { transactions: [], errors: [], summary: { totalRows: 0, parsed: 0, failed: 0, format: "wazirx" } };
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const idx = {
    date:         header.indexOf("date"),
    market:       header.indexOf("market"),
    type:         header.indexOf("type"),
    buy:          header.indexOf("buy"),
    buyUnit:      header.indexOf("buy unit"),
    buyValueInr:  header.findIndex((h) => h.includes("buy-value")),
    sell:         header.indexOf("sell"),
    sellUnit:     header.indexOf("sell unit"),
    sellValueInr: header.findIndex((h) => h.includes("sell-value")),
    fee:          header.indexOf("fee"),
    feeUnit:      header.indexOf("fee unit"),
  };

  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];
  const dataRows = rows.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      const rawType = idx.type >= 0 ? (row[idx.type] ?? "") : "";
      const txType = mapWazirXType(rawType);

      const isBuy = txType === "BUY";
      const receivedAsset = isBuy ? (row[idx.buyUnit] ?? "").trim() : undefined;
      const sentAsset = !isBuy ? (row[idx.sellUnit] ?? "").trim() : undefined;

      const receivedAmount = isBuy && idx.buy >= 0 ? safeParseNumber(row[idx.buy]) : undefined;
      const sentAmount = !isBuy && idx.sell >= 0 ? safeParseNumber(row[idx.sell]) : undefined;

      // INR value stored in notes for downstream enrichment
      const inrValue = isBuy
        ? (idx.buyValueInr >= 0 ? safeParseNumber(row[idx.buyValueInr]) : undefined)
        : (idx.sellValueInr >= 0 ? safeParseNumber(row[idx.sellValueInr]) : undefined);

      const feeAmount = idx.fee >= 0 ? safeParseNumber(row[idx.fee]) : undefined;
      const feeAsset = idx.feeUnit >= 0 ? (row[idx.feeUnit] ?? "").trim() || undefined : undefined;

      transactions.push({
        timestamp: idx.date >= 0 ? (safeParseDateToIso(row[idx.date] ?? "") ?? "") : "",
        type: txType,
        receivedAsset: receivedAsset || undefined,
        receivedAmount,
        sentAsset: sentAsset || undefined,
        sentAmount,
        feeAmount,
        feeAsset,
        notes: inrValue != null ? `INR value: ${inrValue}` : undefined,
      });
    } catch (e) {
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    transactions,
    errors,
    summary: { totalRows: dataRows.length, parsed: transactions.length, failed: errors.length, format: "wazirx" },
  };
}
