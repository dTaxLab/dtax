/**
 * Binance CSV Format Parsers
 *
 * Supports two formats:
 * 1. Binance International — Trade History export
 *    Columns: Date(UTC), Pair, Side, Price, Executed, Amount, Fee
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
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

// ─── Binance International ──────────────────────────

function mapBinanceSide(side: string): ParsedTransaction["type"] {
  const upper = side.toUpperCase().trim();
  if (upper === "BUY") return "BUY";
  if (upper === "SELL") return "SELL";
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
 */
export function isBinanceCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    (firstLine.includes("date(utc)") || firstLine.includes("date (utc)")) &&
    firstLine.includes("pair") &&
    firstLine.includes("side")
  );
}

/**
 * Parse Binance International trade history CSV.
 */
export function parseBinanceCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      // Find timestamp — try common column name variants
      const tsRaw = row["date(utc)"] || row["date (utc)"] || row["date"] || "";
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      const pairStr = row["pair"] || row["market"] || "";
      const pair = parsePair(pairStr);
      if (!pair) {
        errors.push({
          row: rowNum,
          message: `Cannot parse pair: "${pairStr}"`,
        });
        continue;
      }

      const side = row["side"] || row["type"] || "";
      const type = mapBinanceSide(side);

      const executed = safeParseNumber(
        row["executed"] || row["filled"] || row["amount"],
      );
      const price = safeParseNumber(row["price"] || row["avg trading price"]);
      const total = safeParseNumber(
        row["amount"] || row["total"] || row["vol"],
      );
      const fee = safeParseNumber(row["fee"]);

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
        // Binance fee column sometimes contains the asset name
        const feeAssetRaw = row["fee coin"] || row["fee asset"] || "";
        tx.feeAsset = feeAssetRaw.toUpperCase() || pair.quote;
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
