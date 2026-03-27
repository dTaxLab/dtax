/**
 * Bitstamp CSV Format Parser
 *
 * Handles Bitstamp's transaction history export:
 * Type,Datetime,Account,Amount,Value,Rate,Fee,Sub Type
 *
 * Amount/Value/Fee fields embed the currency symbol: "0.00100000 BTC", "19.08 USD"
 * Type: Market, Deposit, Withdrawal, Crypto deposit, Crypto withdrawal,
 *       Staking reward, Referral reward, Earn interest, etc.
 * Sub Type: "Buy" or "Sell" (only for Market rows)
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

const FIAT_CURRENCIES = new Set(["USD", "EUR", "GBP"]);

/**
 * Parse an amount string like "0.00100000 BTC" or "19.08 USD".
 * Returns { amount, currency } or null on failure.
 */
function parseAmountField(
  raw: string,
): { amount: number; currency: string } | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const lastSpace = s.lastIndexOf(" ");
  if (lastSpace < 0) return null;
  const numStr = s.slice(0, lastSpace).replace(/,/g, "");
  const currency = s
    .slice(lastSpace + 1)
    .toUpperCase()
    .trim();
  const amount = safeParseNumber(numStr);
  if (amount == null || !currency) return null;
  return { amount, currency };
}

/** Map Bitstamp Type/Sub Type to DTax type */
function mapBitstampType(
  type: string,
  subType: string,
): ParsedTransaction["type"] {
  const t = type.toLowerCase().trim();
  const sub = subType.toLowerCase().trim();

  if (t === "market") {
    if (sub === "buy") return "BUY";
    if (sub === "sell") return "SELL";
  }
  if (t === "deposit" || t === "crypto deposit" || t === "ripple deposit") {
    return "TRANSFER_IN";
  }
  if (
    t === "withdrawal" ||
    t === "crypto withdrawal" ||
    t === "ripple withdrawal"
  ) {
    return "TRANSFER_OUT";
  }
  if (t === "staking reward" || t === "staking") return "STAKING_REWARD";
  if (t === "referral reward" || t === "referral bonus") return "AIRDROP";
  if (t === "earn interest" || t === "interest" || t === "savings interest") {
    return "INTEREST";
  }
  return "UNKNOWN";
}

/**
 * Detect if a CSV is in Bitstamp format.
 * Unique identifier: "sub type" column alongside "type" and "datetime".
 */
export function isBitstampCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("datetime") &&
    firstLine.includes("sub type") &&
    firstLine.includes("amount") &&
    !firstLine.includes("pair")
  );
}

/**
 * Parse a Bitstamp transaction history CSV.
 */
export function parseBitstampCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const errors: CsvParseError[] = [];
  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tx = parseRow(row, rowNum, errors);
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
      format: "bitstamp",
    },
  };
}

function parseRow(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  // Timestamp
  const tsRaw = row["datetime"] || row["date"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const type = row["type"] || "";
  const subType = row["sub type"] || "";
  const txType = mapBitstampType(type, subType);

  if (txType === "UNKNOWN") {
    // Skip unrecognised rows silently (e.g. "Conversion", internal transfers)
    return null;
  }

  const amountParsed = parseAmountField(row["amount"] || "");
  const valueParsed = parseAmountField(row["value"] || "");
  const feeParsed = parseAmountField(row["fee"] || "");

  if (!amountParsed) {
    errors.push({ row: rowNum, message: `Invalid amount: "${row["amount"]}"` });
    return null;
  }

  const tx: ParsedTransaction = { type: txType, timestamp };

  if (txType === "BUY") {
    // Amount = crypto received, Value = fiat spent
    tx.receivedAsset = amountParsed.currency;
    tx.receivedAmount = Math.abs(amountParsed.amount);
    if (valueParsed) {
      tx.sentAsset = valueParsed.currency;
      tx.sentAmount = Math.abs(valueParsed.amount);
      if (FIAT_CURRENCIES.has(valueParsed.currency)) {
        tx.receivedValueUsd = Math.abs(valueParsed.amount);
      }
    }
  } else if (txType === "SELL") {
    // Amount = crypto sold (negative), Value = fiat received
    tx.sentAsset = amountParsed.currency;
    tx.sentAmount = Math.abs(amountParsed.amount);
    if (valueParsed) {
      tx.receivedAsset = valueParsed.currency;
      tx.receivedAmount = Math.abs(valueParsed.amount);
      if (FIAT_CURRENCIES.has(valueParsed.currency)) {
        tx.sentValueUsd = Math.abs(valueParsed.amount);
      }
    }
  } else {
    // Deposit / Withdrawal / Reward — amount is the asset
    const isInflow =
      txType === "TRANSFER_IN" ||
      txType === "STAKING_REWARD" ||
      txType === "AIRDROP" ||
      txType === "INTEREST";
    if (isInflow) {
      tx.receivedAsset = amountParsed.currency;
      tx.receivedAmount = Math.abs(amountParsed.amount);
    } else {
      tx.sentAsset = amountParsed.currency;
      tx.sentAmount = Math.abs(amountParsed.amount);
    }
  }

  // Fee
  if (feeParsed && Math.abs(feeParsed.amount) > 0) {
    tx.feeAmount = Math.abs(feeParsed.amount);
    tx.feeAsset = feeParsed.currency;
    if (FIAT_CURRENCIES.has(feeParsed.currency)) {
      tx.feeValueUsd = Math.abs(feeParsed.amount);
    }
  }

  return tx;
}
