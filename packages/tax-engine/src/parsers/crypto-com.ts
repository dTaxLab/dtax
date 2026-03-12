/**
 * Crypto.com CSV Format Parser
 *
 * Handles the Crypto.com App transaction history export:
 * Timestamp (UTC), Transaction Description, Currency, Amount, To Currency, To Amount,
 * Native Currency, Native Amount, Native Amount (in USD), Transaction Kind
 *
 * Also handles the newer format:
 * Date, Sent Amount, Sent Currency, Received Amount, Received Currency,
 * Fee Amount, Fee Currency, Net Worth Amount, Net Worth Currency, Label, Description, TxHash
 *
 * @license AGPL-3.0
 */

import {
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "./csv-core";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/** Map Crypto.com transaction kind/label to DTax type */
function mapCryptoComType(
  kind: string,
  description: string,
): ParsedTransaction["type"] {
  const k = kind.toLowerCase().trim();
  const d = description.toLowerCase();

  // App format "Transaction Kind" values
  if (k === "crypto_purchase" || k === "buy") return "BUY";
  if (k === "crypto_sale" || k === "sell") return "SELL";
  if (k === "crypto_deposit" || k === "deposit") return "TRANSFER_IN";
  if (k === "crypto_withdrawal" || k === "withdrawal") return "TRANSFER_OUT";
  if (k === "crypto_transfer")
    return d.includes("sent") ? "TRANSFER_OUT" : "TRANSFER_IN";
  if (k === "crypto_exchange" || k === "exchange" || k === "swap")
    return "TRADE";
  if (
    k === "rewards_platform_deposit_credited" ||
    k === "reward" ||
    k === "staking_reward"
  )
    return "STAKING_REWARD";
  if (k === "mco_stake_reward" || k === "stake_reward") return "STAKING_REWARD";
  if (k === "crypto_earn_interest_paid" || k === "interest") return "INTEREST";
  if (
    k === "referral_card_cashback" ||
    k === "reimbursement" ||
    k === "cashback"
  )
    return "INTEREST";
  if (k === "airdrop" || k === "admin_wallet_credited") return "AIRDROP";
  if (k === "dust_conversion_credited" || k === "dust_conversion_debited")
    return "TRADE";
  if (k === "viban_purchase" || k === "crypto_viban_exchange") return "BUY";

  // Newer "Label" field values
  if (k === "sent" || k === "send") return "TRANSFER_OUT";
  if (k === "received" || k === "receive") return "TRANSFER_IN";

  return "UNKNOWN";
}

/**
 * Detect if a CSV is in Crypto.com format.
 */
export function isCryptoComCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  // App format (distinctive: "transaction kind" + "native amount")
  if (
    firstLine.includes("transaction kind") &&
    firstLine.includes("native amount")
  ) {
    return true;
  }
  return false;
}

/**
 * Parse a Crypto.com App CSV export.
 */
export function parseCryptoComCsv(csv: string): CsvParseResult {
  const objects = parseCsvToObjects(csv);
  const errors: CsvParseError[] = [];
  const transactions: ParsedTransaction[] = [];

  if (objects.length === 0) {
    return {
      transactions,
      errors,
      summary: { totalRows: 0, parsed: 0, failed: 0, format: "crypto_com" },
    };
  }

  // Detect which format variant
  const keys = Object.keys(objects[0]);
  const isNewerFormat = keys.some((k) => k.includes("sent amount"));

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const rowNum = i + 2;

    try {
      const tx = isNewerFormat
        ? parseNewerFormat(row, rowNum, errors)
        : parseAppFormat(row, rowNum, errors);
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
      format: "crypto_com",
    },
  };
}

/**
 * Parse newer format row:
 * Date, Sent Amount, Sent Currency, Received Amount, Received Currency,
 * Fee Amount, Fee Currency, Net Worth Amount, Net Worth Currency, Label, Description, TxHash
 */
function parseNewerFormat(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  const tsRaw = row["date"] || row["timestamp"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const label = row["label"] || "";
  const description = row["description"] || "";
  const type = mapCryptoComType(label, description);

  const tx: ParsedTransaction = { type, timestamp };

  const sentAmt = safeParseNumber(row["sent amount"]);
  const sentCur = (row["sent currency"] || "").toUpperCase().trim();
  const rcvAmt = safeParseNumber(row["received amount"]);
  const rcvCur = (row["received currency"] || "").toUpperCase().trim();
  const feeAmt = safeParseNumber(row["fee amount"]);
  const feeCur = (row["fee currency"] || "").toUpperCase().trim();
  const netWorth = safeParseNumber(row["net worth amount"]);

  if (sentAmt && sentCur) {
    tx.sentAsset = sentCur;
    tx.sentAmount = sentAmt;
  }
  if (rcvAmt && rcvCur) {
    tx.receivedAsset = rcvCur;
    tx.receivedAmount = rcvAmt;
  }
  if (feeAmt && feeCur) {
    tx.feeAsset = feeCur;
    tx.feeAmount = feeAmt;
  }
  if (netWorth) {
    // Net worth is USD value
    if (tx.sentAsset && !tx.receivedAsset) {
      tx.sentValueUsd = netWorth;
    } else if (tx.receivedAsset && !tx.sentAsset) {
      tx.receivedValueUsd = netWorth;
    }
  }

  if (!tx.sentAsset && !tx.receivedAsset) {
    errors.push({ row: rowNum, message: "No amount found" });
    return null;
  }

  if (description) {
    tx.notes = description;
  }

  return tx;
}

/**
 * Parse app format row:
 * Timestamp (UTC), Transaction Description, Currency, Amount, To Currency, To Amount,
 * Native Currency, Native Amount, Native Amount (in USD), Transaction Kind
 */
function parseAppFormat(
  row: Record<string, string>,
  rowNum: number,
  errors: CsvParseError[],
): ParsedTransaction | null {
  const tsRaw = row["timestamp (utc)"] || row["timestamp"] || row["date"] || "";
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const kind = row["transaction kind"] || "";
  const description = row["transaction description"] || "";
  const type = mapCryptoComType(kind, description);

  const currency = (row["currency"] || "").toUpperCase().trim();
  const amount = safeParseNumber(row["amount"]);
  const toCurrency = (row["to currency"] || "").toUpperCase().trim();
  const toAmount = safeParseNumber(row["to amount"]);
  const nativeUsd = safeParseNumber(row["native amount (in usd)"]);

  const tx: ParsedTransaction = { type, timestamp };

  if (amount != null && currency) {
    if (amount > 0) {
      tx.receivedAsset = currency;
      tx.receivedAmount = amount;
      if (nativeUsd) tx.receivedValueUsd = Math.abs(nativeUsd);
    } else if (amount < 0) {
      tx.sentAsset = currency;
      tx.sentAmount = Math.abs(amount);
      if (nativeUsd) tx.sentValueUsd = Math.abs(nativeUsd);
    }
  }

  if (toAmount && toCurrency) {
    tx.receivedAsset = toCurrency;
    tx.receivedAmount = toAmount;
    // If we had a negative primary amount → this is a trade/exchange
    if (tx.sentAsset && !tx.receivedValueUsd && nativeUsd) {
      tx.receivedValueUsd = Math.abs(nativeUsd);
    }
  }

  if (!tx.sentAsset && !tx.receivedAsset) {
    errors.push({ row: rowNum, message: "No amount found" });
    return null;
  }

  if (description) {
    tx.notes = description;
  }

  return tx;
}
