/**
 * ZebPay CSV Format Parser
 *
 * Handles ZebPay transaction history export:
 * Date, Type, Currency, Amount, INR Amount, Status, Transaction ID
 *
 * @license AGPL-3.0
 */

import { parseCsvRows, safeParseNumber, safeParseDateToIso } from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

function mapZebPayType(raw: string): ParsedTransaction["type"] {
  const map: Record<string, ParsedTransaction["type"]> = {
    buy:                "BUY",
    sell:               "SELL",
    deposit:            "TRANSFER_IN",
    withdrawal:         "TRANSFER_OUT",
    "crypto deposit":   "TRANSFER_IN",
    "crypto withdrawal":"TRANSFER_OUT",
    "inr deposit":      "TRANSFER_IN",
    "inr withdrawal":   "TRANSFER_OUT",
  };
  return map[raw.toLowerCase().trim()] ?? "UNKNOWN";
}

export function isZebPayCsv(csv: string): boolean {
  const first = csv.split("\n")[0]?.toLowerCase() ?? "";
  return (
    first.includes("inr amount") &&
    first.includes("currency") &&
    first.includes("transaction id")
  );
}

export function parseZebPayCsv(csv: string): CsvParseResult {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) {
    return { transactions: [], errors: [], summary: { totalRows: 0, parsed: 0, failed: 0, format: "zebpay" } };
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const idx = {
    date:      header.indexOf("date"),
    type:      header.indexOf("type"),
    currency:  header.indexOf("currency"),
    amount:    header.indexOf("amount"),
    inrAmount: header.indexOf("inr amount"),
  };

  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];
  const dataRows = rows.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      const rawType = idx.type >= 0 ? (row[idx.type] ?? "") : "";
      const txType = mapZebPayType(rawType);
      const currency = idx.currency >= 0 ? (row[idx.currency] ?? "").trim().toUpperCase() : "UNKNOWN";
      const amount = idx.amount >= 0 ? safeParseNumber(row[idx.amount]) : undefined;
      const inrAmount = idx.inrAmount >= 0 ? safeParseNumber(row[idx.inrAmount]) : undefined;

      const isBuy = txType === "BUY";
      const isTransferIn = txType === "TRANSFER_IN";

      transactions.push({
        timestamp: idx.date >= 0 ? (safeParseDateToIso(row[idx.date] ?? "") ?? "") : "",
        type: txType,
        receivedAsset: (isBuy || isTransferIn) ? currency : undefined,
        receivedAmount: (isBuy || isTransferIn) ? amount : undefined,
        sentAsset: isBuy ? "INR" : (!isTransferIn ? currency : undefined),
        sentAmount: isBuy ? inrAmount : (!isTransferIn ? amount : undefined),
        notes: inrAmount != null ? `INR amount: ${inrAmount}` : undefined,
      });
    } catch (e) {
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    transactions,
    errors,
    summary: { totalRows: dataRows.length, parsed: transactions.length, failed: errors.length, format: "zebpay" },
  };
}
