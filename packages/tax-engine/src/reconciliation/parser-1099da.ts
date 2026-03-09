/**
 * 1099-DA CSV Parser
 *
 * Parses CSV files from exchange-issued 1099-DA reports.
 * Supports common exchange formats (Coinbase, Binance, generic).
 *
 * @license AGPL-3.0
 */

import { parseCsvToObjects } from "../parsers";
import type { Form1099DAEntry, Parse1099DAResult } from "./types";

/** Known column name mappings for different broker formats */
const COLUMN_MAPS: Record<string, Record<string, string>> = {
  coinbase: {
    asset: "Asset Name",
    dateSold: "Date of Sale",
    dateAcquired: "Date Acquired",
    grossProceeds: "Gross Proceeds",
    costBasis: "Cost Basis",
    gainLoss: "Gain/Loss",
    transactionId: "Transaction ID",
  },
  generic: {
    asset: "asset",
    dateSold: "date_sold",
    dateAcquired: "date_acquired",
    grossProceeds: "gross_proceeds",
    costBasis: "cost_basis",
    gainLoss: "gain_loss",
    transactionId: "transaction_id",
  },
};

const ASSET_ALIASES: Record<string, string> = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  SOLANA: "SOL",
  DOGECOIN: "DOGE",
  "BITCOIN CASH": "BCH",
  "ETHEREUM CLASSIC": "ETC",
  LITECOIN: "LTC",
  RIPPLE: "XRP",
  CARDANO: "ADA",
  POLKADOT: "DOT",
};

function normalizeAsset(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  // Check full-name aliases first (exact match)
  if (ASSET_ALIASES[trimmed]) return ASSET_ALIASES[trimmed];
  // Otherwise strip whitespace and return as-is (already a ticker)
  return trimmed.replace(/\s+/g, "");
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw || raw.trim() === "" || raw.trim().toLowerCase() === "various")
    return undefined;
  const d = new Date(raw.trim());
  return isNaN(d.getTime()) ? undefined : d;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw || raw.trim() === "") return undefined;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1");
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

function detectFormat(headers: string[]): "coinbase" | "generic" {
  const joined = headers.join(",").toLowerCase();
  if (joined.includes("asset name") && joined.includes("gross proceeds"))
    return "coinbase";
  return "generic";
}

/**
 * Parse a 1099-DA CSV file.
 *
 * @param csvContent - Raw CSV text
 * @param brokerName - Name of the broker/exchange
 * @param taxYear - Tax year for the report
 */
export function parse1099DA(
  csvContent: string,
  brokerName: string = "Unknown",
  taxYear: number = new Date().getFullYear() - 1,
): Parse1099DAResult {
  const entries: Form1099DAEntry[] = [];
  const errors: { row: number; message: string }[] = [];

  const rows = parseCsvToObjects(csvContent);
  if (rows.length === 0) {
    return {
      entries,
      errors: [{ row: 0, message: "No data rows found" }],
      brokerName,
      taxYear,
    };
  }

  // Detect format from headers
  const headers = Object.keys(rows[0]);
  const format = detectFormat(headers);
  const colMap = COLUMN_MAPS[format];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row

    try {
      // Find the right column value using the column map
      const getVal = (key: string): string | undefined => {
        const colName = colMap[key];
        if (!colName) return undefined;
        // Try exact match first, then case-insensitive
        return (
          row[colName] ??
          Object.entries(row).find(
            ([k]) =>
              k.toLowerCase().replace(/[_\s]/g, "") ===
              colName.toLowerCase().replace(/[_\s]/g, ""),
          )?.[1]
        );
      };

      const asset = getVal("asset");
      const dateSoldRaw = getVal("dateSold");
      const grossProceedsRaw = getVal("grossProceeds");

      if (!asset || !dateSoldRaw || !grossProceedsRaw) {
        errors.push({
          row: rowNum,
          message: "Missing required fields (asset, date_sold, gross_proceeds)",
        });
        continue;
      }

      const dateSold = parseDate(dateSoldRaw);
      if (!dateSold) {
        errors.push({ row: rowNum, message: `Invalid date: ${dateSoldRaw}` });
        continue;
      }

      const grossProceeds = parseNumber(grossProceedsRaw);
      if (grossProceeds === undefined) {
        errors.push({
          row: rowNum,
          message: `Invalid proceeds: ${grossProceedsRaw}`,
        });
        continue;
      }

      entries.push({
        rowIndex: rowNum,
        asset: normalizeAsset(asset),
        dateSold,
        dateAcquired: parseDate(getVal("dateAcquired")),
        grossProceeds,
        costBasis: parseNumber(getVal("costBasis")),
        gainLoss: parseNumber(getVal("gainLoss")),
        transactionId: getVal("transactionId"),
        brokerName,
      });
    } catch (e) {
      errors.push({
        row: rowNum,
        message: `Parse error: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  }

  return { entries, errors, brokerName, taxYear };
}
