/**
 * Kraken CSV Format Parser
 *
 * Handles Kraken's Ledger History export format:
 * txid, refid, time, type, subtype, aclass, asset, amount, fee, balance
 *
 * Kraken transaction types:
 *   deposit, withdrawal, trade, staking, transfer, margin trade
 *
 * Kraken asset naming: XXBT = BTC, XETH = ETH, ZUSD = USD, XXRP = XRP, etc.
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/** Map Kraken's internal asset codes to standard symbols */
function normalizeKrakenAsset(raw: string): string {
  const upper = raw.toUpperCase().trim();
  const map: Record<string, string> = {
    XXBT: "BTC",
    XBT: "BTC",
    XETH: "ETH",
    XXRP: "XRP",
    XXLM: "XLM",
    XXDG: "DOGE",
    XDOGE: "DOGE",
    XLTC: "LTC",
    XXMR: "XMR",
    ZUSD: "USD",
    ZEUR: "EUR",
    ZGBP: "GBP",
    ZJPY: "JPY",
    ZCAD: "CAD",
    ZAUD: "AUD",
  };
  return map[upper] || upper.replace(/^[XZ]/, "");
}

/** Map Kraken transaction type to DTax type */
function mapKrakenType(
  type: string,
  subtype: string,
  amount: number,
): ParsedTransaction["type"] {
  const t = type.toLowerCase().trim();
  const s = subtype.toLowerCase().trim();

  if (t === "trade") return amount > 0 ? "BUY" : "SELL";
  if (t === "deposit") return "TRANSFER_IN";
  if (t === "withdrawal") return "TRANSFER_OUT";
  if (t === "staking") return "STAKING_REWARD";
  if (t === "transfer") {
    if (s === "stakingfromspot" || s === "spottostaking") return "TRANSFER_OUT";
    if (s === "stakingtospot" || s === "spotfromstaking") return "TRANSFER_IN";
    return amount > 0 ? "TRANSFER_IN" : "TRANSFER_OUT";
  }
  if (t === "margin trade") return "TRADE";
  if (t === "earn" || t === "reward") return "INTEREST";
  if (t === "airdrop") return "AIRDROP";
  return "UNKNOWN";
}

const FIAT_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
]);

/**
 * Detect if a CSV is in Kraken Ledger format.
 */
export function isKrakenCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("txid") &&
    firstLine.includes("refid") &&
    firstLine.includes("aclass")
  );
}

/**
 * Parse a Kraken Ledger History CSV.
 *
 * Kraken exports trades as paired ledger entries sharing the same refid:
 * one with negative amount (sent) and one with positive amount (received).
 * We group by refid to reconstruct complete transactions.
 */
export function parseKrakenCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const errors: CsvParseError[] = [];

  // Group entries by refid for trade pairing
  const byRefId = new Map<
    string,
    { rows: typeof objects; indices: number[] }
  >();
  const standaloneEntries: { row: (typeof objects)[0]; index: number }[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const refid = row["refid"] || "";
    const type = (row["type"] || "").toLowerCase().trim();

    if (type === "trade" && refid) {
      const group = byRefId.get(refid) || { rows: [], indices: [] };
      group.rows.push(row);
      group.indices.push(i);
      byRefId.set(refid, group);
    } else {
      standaloneEntries.push({ row, index: i });
    }
  }

  const transactions: ParsedTransaction[] = [];

  // Process paired trades (grouped by refid)
  for (const [, group] of byRefId) {
    const rowNum = group.indices[0] + 2;

    try {
      const first = group.rows[0];
      const tsRaw = first["time"] || first["timestamp"] || "";
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      if (group.rows.length === 2) {
        // Standard trade pair: one positive (received), one negative (sent)
        const [a, b] = group.rows;
        const amtA = safeParseNumber(a["amount"]) || 0;
        const feeA = safeParseNumber(a["fee"]) || 0;
        const feeB = safeParseNumber(b["fee"]) || 0;

        const [sent, received] = amtA < 0 ? [a, b] : [b, a];
        const sentAsset = normalizeKrakenAsset(sent["asset"] || "");
        const receivedAsset = normalizeKrakenAsset(received["asset"] || "");
        const sentAmount = Math.abs(safeParseNumber(sent["amount"]) || 0);
        const receivedAmount = Math.abs(
          safeParseNumber(received["amount"]) || 0,
        );

        const isFiatSent = FIAT_CURRENCIES.has(sentAsset);
        const isFiatReceived = FIAT_CURRENCIES.has(receivedAsset);

        const tx: ParsedTransaction = {
          type: isFiatSent ? "BUY" : isFiatReceived ? "SELL" : "TRADE",
          timestamp,
          sentAsset,
          sentAmount,
          receivedAsset,
          receivedAmount,
        };

        // If one side is fiat, use it as USD value
        if (isFiatSent) {
          tx.receivedValueUsd = sentAmount;
        } else if (isFiatReceived) {
          tx.sentValueUsd = receivedAmount;
        }

        const totalFee = feeA + feeB;
        if (totalFee > 0) {
          tx.feeAmount = totalFee;
          tx.feeAsset = normalizeKrakenAsset(
            (safeParseNumber(a["fee"]) || 0) > 0
              ? a["asset"] || ""
              : b["asset"] || "",
          );
        }

        transactions.push(tx);
      } else {
        // Single or 3+ entries per refid — process individually
        for (const row of group.rows) {
          const tx = parseSingleEntry(row, rowNum, errors);
          if (tx) transactions.push(tx);
        }
      }
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  // Process standalone (non-trade) entries
  for (const { row, index } of standaloneEntries) {
    const rowNum = index + 2;
    const tx = parseSingleEntry(row, rowNum, errors);
    if (tx) transactions.push(tx);
  }

  // Sort by timestamp
  transactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    transactions,
    errors,
    summary: {
      totalRows: objects.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "kraken",
    },
  };
}

/** Parse a single ledger entry (deposit, withdrawal, staking, etc.) */
function parseSingleEntry(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  const tsRaw = row["time"] || row["timestamp"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const rawType = row["type"] || "";
  const subtype = row["subtype"] || "";
  const asset = normalizeKrakenAsset(row["asset"] || "");
  const amount = safeParseNumber(row["amount"]) || 0;
  const fee = safeParseNumber(row["fee"]) || 0;

  if (!asset) {
    errors.push({ row: rowNum, message: "Missing asset" });
    return null;
  }

  const type = mapKrakenType(rawType, subtype, amount);

  const tx: ParsedTransaction = { type, timestamp };

  if (amount > 0) {
    tx.receivedAsset = asset;
    tx.receivedAmount = amount;
  } else {
    tx.sentAsset = asset;
    tx.sentAmount = Math.abs(amount);
  }

  if (fee > 0) {
    tx.feeAmount = fee;
    tx.feeAsset = asset;
  }

  return tx;
}
