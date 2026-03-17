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
 * Supports multi-language headers (English, Chinese Simplified/Traditional, Japanese, Korean).
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

// ─── Multi-language column name mappings for Crypto.com ─────────

// App format columns
const COL_TIMESTAMP = [
  "timestamp (utc)",
  "timestamp",
  "date",
  "时间戳 (utc)",
  "时间戳",
  "時間戳 (utc)", // ZH
  "タイムスタンプ (utc)",
  "日時", // JA
  "타임스탬프 (utc)",
  "날짜", // KO
];

const COL_TX_DESCRIPTION = [
  "transaction description",
  "交易描述", // ZH
  "取引説明", // JA
  "거래 설명", // KO
];

const COL_TX_KIND = [
  "transaction kind",
  "transaction type",
  "交易类型",
  "交易類型", // ZH
  "取引種類", // JA
  "거래 유형", // KO
];

const COL_CURRENCY = [
  "currency",
  "币种",
  "幣種", // ZH
  "通貨", // JA
  "통화", // KO
];

const COL_AMOUNT = [
  "amount",
  "金额",
  "金額", // ZH/JA
  "금액", // KO
];

const COL_TO_CURRENCY = [
  "to currency",
  "目标币种",
  "目標幣種", // ZH
  "変換先通貨", // JA
  "대상 통화", // KO
];

const COL_TO_AMOUNT = [
  "to amount",
  "目标金额",
  "目標金額", // ZH
  "変換先金額", // JA
  "대상 금액", // KO
];

const COL_NATIVE_AMOUNT_USD = [
  "native amount (in usd)",
  "native amount in usd",
  "本地金额 (usd)",
  "本地金額 (usd)", // ZH
  "ネイティブ金額 (usd)", // JA
];

// Newer format columns
const COL_SENT_AMOUNT = [
  "sent amount",
  "发送金额",
  "發送金額", // ZH
  "送金額", // JA
  "보낸 금액", // KO
];

const COL_SENT_CURRENCY = [
  "sent currency",
  "发送币种",
  "發送幣種", // ZH
  "送金通貨", // JA
  "보낸 통화", // KO
];

const COL_RECEIVED_AMOUNT = [
  "received amount",
  "接收金额",
  "接收金額", // ZH
  "受取金額", // JA
  "받은 금액", // KO
];

const COL_RECEIVED_CURRENCY = [
  "received currency",
  "接收币种",
  "接收幣種", // ZH
  "受取通貨", // JA
  "받은 통화", // KO
];

const COL_FEE_AMOUNT = [
  "fee amount",
  "手续费金额",
  "手續費金額", // ZH
  "手数料額", // JA
  "수수료 금액", // KO
];

const COL_FEE_CURRENCY = [
  "fee currency",
  "手续费币种",
  "手續費幣種", // ZH
  "手数料通貨", // JA
  "수수료 통화", // KO
];

const COL_NET_WORTH_AMOUNT = [
  "net worth amount",
  "净值金额",
  "淨值金額", // ZH
  "純資産額", // JA
];

// COL_NET_WORTH_CURRENCY kept for future use by newer format parsers
// const COL_NET_WORTH_CURRENCY = [
//   "net worth currency",
//   "净值币种", "淨值幣種",  // ZH
//   "純資産通貨",            // JA
// ];

const COL_LABEL = [
  "label",
  "标签",
  "標籤", // ZH
  "ラベル", // JA
  "라벨", // KO
];

const COL_DESCRIPTION = [
  "description",
  "描述", // ZH
  "説明", // JA
  "설명", // KO
];

// ─── Helpers ────────────────────────────────────────────────────

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
  const norm = normalizeKey(firstLine);
  // App format (distinctive: "transaction kind" + "native amount")
  if (norm.includes("transaction kind") && norm.includes("native amount"))
    return true;
  // Chinese Simplified: "交易类型" + "本地金额"
  if (norm.includes("交易类型") && norm.includes("本地金额")) return true;
  // Chinese Traditional: "交易類型" + "本地金額"
  if (norm.includes("交易類型") && norm.includes("本地金額")) return true;
  // Japanese: "取引種類" + "ネイティブ金額"
  if (norm.includes("取引種類") && norm.includes("ネイティブ金額")) return true;
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
  const isNewerFormat = keys.some((k) =>
    COL_SENT_AMOUNT.some((c) => k.includes(c)),
  );

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
  const tsRaw = resolveCol(row, COL_TIMESTAMP);
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const label = resolveCol(row, COL_LABEL);
  const description = resolveCol(row, COL_DESCRIPTION);
  const type = mapCryptoComType(label, description);

  const tx: ParsedTransaction = { type, timestamp };

  const sentAmt = safeParseNumber(resolveCol(row, COL_SENT_AMOUNT));
  const sentCur = resolveCol(row, COL_SENT_CURRENCY).toUpperCase().trim();
  const rcvAmt = safeParseNumber(resolveCol(row, COL_RECEIVED_AMOUNT));
  const rcvCur = resolveCol(row, COL_RECEIVED_CURRENCY).toUpperCase().trim();
  const feeAmt = safeParseNumber(resolveCol(row, COL_FEE_AMOUNT));
  const feeCur = resolveCol(row, COL_FEE_CURRENCY).toUpperCase().trim();
  const netWorth = safeParseNumber(resolveCol(row, COL_NET_WORTH_AMOUNT));

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
  const tsRaw = resolveCol(row, COL_TIMESTAMP);
  const timestamp = safeParseDateToIso(tsRaw);
  if (!timestamp) {
    errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
    return null;
  }

  const kind = resolveCol(row, COL_TX_KIND);
  const description = resolveCol(row, COL_TX_DESCRIPTION);
  const type = mapCryptoComType(kind, description);

  const currency = resolveCol(row, COL_CURRENCY).toUpperCase().trim();
  const amount = safeParseNumber(resolveCol(row, COL_AMOUNT));
  const toCurrency = resolveCol(row, COL_TO_CURRENCY).toUpperCase().trim();
  const toAmount = safeParseNumber(resolveCol(row, COL_TO_AMOUNT));
  const nativeUsd = safeParseNumber(resolveCol(row, COL_NATIVE_AMOUNT_USD));

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
