/**
 * Kraken CSV Format Parsers
 *
 * Kraken exports two structurally distinct reports that both start with a
 * "txid" column, which this module tells apart:
 *
 * 1. Ledger History ("分类账"): txid, refid, time, type, subtype, aclass,
 *    asset, amount, fee, balance — deposits/withdrawals/staking/earn/trades
 *    as paired debit+credit rows. Handled by parseKrakenCsv.
 * 2. Trades ("交易"): txid, ordertxid, pair, time, type(buy/sell), price,
 *    cost, fee, vol — one row per order fill, the actual spot buy/sell
 *    history. Handled by parseKrakenTradesCsv.
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

/**
 * Split a Kraken Trades "pair" column (e.g. "BTC/USD") into base + quote
 * assets, normalizing each side through normalizeKrakenAsset so legacy
 * codes (XXBT, ZUSD, ...) resolve the same way as the Ledger parser.
 * Falls back to matching a known quote suffix for pairs with no "/"
 * (older Kraken exports sometimes concatenate, e.g. "XXBTZUSD").
 */
function splitKrakenPair(pair: string): { base: string; quote: string } | null {
  const trimmed = pair.trim();
  if (trimmed.includes("/")) {
    const [base, quote] = trimmed.split("/");
    if (!base || !quote) return null;
    return {
      base: normalizeKrakenAsset(base),
      quote: normalizeKrakenAsset(quote),
    };
  }

  const upper = trimmed.toUpperCase();
  const knownQuotes = [
    "ZUSD",
    "ZEUR",
    "ZGBP",
    "ZJPY",
    "ZCAD",
    "ZAUD",
    "USDT",
    "USDC",
    "USD",
    "EUR",
  ];
  for (const quote of knownQuotes) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return {
        base: normalizeKrakenAsset(upper.slice(0, -quote.length)),
        quote: normalizeKrakenAsset(quote),
      };
    }
  }
  return null;
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
  if (t === "earn") {
    // Kraken's "Earn" product emits two distinct subtypes under the same
    // top-level "earn" type: "reward" is an actual payout (taxable income),
    // "autoallocation"/"allocation"/"deallocation" is Kraken moving the same
    // balance between the "spot / main" and "earn / liquid" wallets — an
    // internal transfer, not new income. Treating both as INTEREST double-
    // counted every reallocation cycle as phantom income (the payout AND
    // its subsequent internal move both landed as taxable interest).
    if (s === "autoallocation" || s === "allocation" || s === "deallocation") {
      return amount > 0 ? "TRANSFER_IN" : "TRANSFER_OUT";
    }
    return "INTEREST";
  }
  if (t === "reward") return "INTEREST";
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

/**
 * Detect if a CSV is in Kraken Trades format (one row per order fill).
 * Distinguished from the Ledger format by "ordertxid" and "pair" — the
 * Ledger format has neither (it has "refid" and "asset" instead).
 */
export function isKrakenTradesCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    firstLine.includes("ordertxid") &&
    firstLine.includes("pair") &&
    firstLine.includes("vol")
  );
}

/**
 * Parse a Kraken Trades CSV — the actual spot buy/sell fill history (as
 * opposed to the Ledger export, which only has trades if you didn't filter
 * by type and can bury them among deposits/staking/Earn activity).
 *
 * One row = one order fill = one ParsedTransaction. Large orders routinely
 * split into dozens of fills at slightly different prices; we don't
 * aggregate by ordertxid because cost basis needs the per-fill price.
 */
export function parseKrakenTradesCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const errors: CsvParseError[] = [];
  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tsRaw = row["time"] || "";
      const timestamp = safeParseDateToIso(tsRaw);
      if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        continue;
      }

      const pairRaw = row["pair"] || "";
      const pair = splitKrakenPair(pairRaw);
      if (!pair) {
        errors.push({
          row: rowNum,
          message: `Unrecognized trading pair: "${pairRaw}"`,
        });
        continue;
      }

      const side = (row["type"] || "").toLowerCase().trim();
      const vol = safeParseNumber(row["vol"]);
      const cost = safeParseNumber(row["cost"]);
      const fee = safeParseNumber(row["fee"]) || 0;

      if (!vol || vol <= 0 || !cost || cost <= 0) {
        errors.push({ row: rowNum, message: "Missing volume or cost" });
        continue;
      }

      const isQuoteFiat = FIAT_CURRENCIES.has(pair.quote);

      let tx: ParsedTransaction;
      if (side === "buy") {
        tx = {
          type: isQuoteFiat ? "BUY" : "TRADE",
          timestamp,
          sentAsset: pair.quote,
          sentAmount: cost,
          receivedAsset: pair.base,
          receivedAmount: vol,
        };
        if (isQuoteFiat) {
          // mapToTaxLot() reads receivedValueUsd as the new lot's cost basis
          // — the fiat amount paid is the USD value of the crypto acquired.
          tx.sentValueUsd = cost;
          tx.receivedValueUsd = cost;
        }
      } else if (side === "sell") {
        tx = {
          type: isQuoteFiat ? "SELL" : "TRADE",
          timestamp,
          sentAsset: pair.base,
          sentAmount: vol,
          receivedAsset: pair.quote,
          receivedAmount: cost,
        };
        if (isQuoteFiat) {
          // mapToTaxableEvent() reads sentValueUsd as the disposal's proceeds
          // — the fiat amount received is the USD value of the crypto sold.
          tx.sentValueUsd = cost;
          tx.receivedValueUsd = cost;
        }
      } else {
        errors.push({
          row: rowNum,
          message: `Unknown trade side: "${row["type"]}"`,
        });
        continue;
      }

      if (fee > 0) {
        tx.feeAmount = fee;
        tx.feeAsset = pair.quote;
      }

      transactions.push(tx);
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
      format: "kraken_trades",
    },
  };
}
