/**
 * Etherscan CSV Format Parser
 *
 * Handles CSV exports from Etherscan and compatible block explorers
 * (Polygonscan, Arbiscan, BscScan, etc.)
 *
 * Supports two CSV formats:
 * 1. Normal transactions (ETH transfers)
 * 2. ERC-20 token transfers
 *
 * @license AGPL-3.0
 */

import { parseCsvToObjects, safeParseNumber } from "./csv-core";
import { isWrapPair } from "../normalizers/wrap-unwrap";
import type { ParsedTransaction, CsvParseResult, CsvParseError } from "./types";

/** Known DEX router addresses (lowercase) */
const KNOWN_DEX_ROUTERS: Record<string, string> = {
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap Universal",
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "SushiSwap",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Protocol",
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch V5",
};

/**
 * Detect if a CSV is in Etherscan normal transactions format.
 */
export function isEtherscanCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    (firstLine.includes("txhash") || firstLine.includes('"txhash"')) &&
    (firstLine.includes("blockno") || firstLine.includes('"blockno"'))
  );
}

/**
 * Detect if a CSV is in Etherscan ERC-20 token transfers format.
 */
export function isEtherscanErc20Csv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  return (
    (firstLine.includes("txhash") || firstLine.includes('"txhash"')) &&
    (firstLine.includes("tokensymbol") ||
      firstLine.includes("token symbol") ||
      firstLine.includes('"tokensymbol"'))
  );
}

/**
 * Classify transaction type based on addresses and context.
 */
function classifyEtherscanTx(
  from: string,
  to: string,
  userAddress: string,
  sentAsset?: string,
  receivedAsset?: string,
): ParsedTransaction["type"] {
  const fromIsUser = from === userAddress;
  const toIsUser = to === userAddress;
  const toLower = to.toLowerCase();

  // Check for known DEX router interaction
  if (KNOWN_DEX_ROUTERS[toLower] || KNOWN_DEX_ROUTERS[from.toLowerCase()]) {
    // If we have both sent and received assets, it's a swap
    if (sentAsset && receivedAsset) {
      if (isWrapPair(sentAsset, receivedAsset)) return "WRAP";
      return "DEX_SWAP";
    }
    return "DEX_SWAP";
  }

  // Wrap/unwrap detection
  if (sentAsset && receivedAsset && isWrapPair(sentAsset, receivedAsset)) {
    return "WRAP";
  }

  // Simple transfers
  if (fromIsUser && !toIsUser) return "TRANSFER_OUT";
  if (!fromIsUser && toIsUser) return "TRANSFER_IN";

  return "UNKNOWN";
}

/**
 * Parse Etherscan normal transaction CSV export.
 *
 * Expected columns:
 * "Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To",
 * "ContractAddress","Value_IN(ETH)","Value_OUT(ETH)","CurrentValue",
 * "TxnFee(ETH)","TxnFee(USD)","Historical $Price/Eth","Status","ErrCode"
 *
 * @param csv - Raw CSV string
 * @param userAddress - The user's wallet address (for direction detection)
 * @param nativeAsset - Native asset symbol (default: 'ETH')
 */
export function parseEtherscanCsv(
  csv: string,
  userAddress: string,
  nativeAsset: string = "ETH",
): CsvParseResult {
  const addr = userAddress.toLowerCase();
  const rows = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // header is row 1

    try {
      // Skip failed transactions
      // Etherscan: Status=0 means failed, ErrCode contains error message (not just "0")
      const status = (row["status"] || "").trim();
      const errCode = (row["errcode"] || "").trim();
      if (status === "0" || (errCode && errCode !== "0")) {
        continue;
      }

      // Parse timestamp
      const unixTs = row["unixtimestamp"];
      if (!unixTs) {
        errors.push({ row: rowNum, message: "Missing timestamp" });
        continue;
      }
      const timestamp = new Date(parseInt(unixTs) * 1000).toISOString();

      const from = (row["from"] || "").toLowerCase();
      const to = (row["to"] || "").toLowerCase();
      const valueIn = safeParseNumber(
        row[`value_in(${nativeAsset.toLowerCase()})`] || row["value_in(eth)"],
      );
      const valueOut = safeParseNumber(
        row[`value_out(${nativeAsset.toLowerCase()})`] || row["value_out(eth)"],
      );
      const txnFeeEth = safeParseNumber(
        row[`txnfee(${nativeAsset.toLowerCase()})`] || row["txnfee(eth)"],
      );
      const txnFeeUsd = safeParseNumber(row["txnfee(usd)"]);
      const histPrice = safeParseNumber(
        row[`historical $price/${nativeAsset.toLowerCase()}`] ||
          row["historical $price/eth"],
      );
      const txhash = row["txhash"] || "";

      // Determine direction
      const fromIsUser = from === addr;
      const toIsUser = to === addr;

      const hasValueIn = valueIn && valueIn > 0 && toIsUser;
      const hasValueOut = valueOut && valueOut > 0 && fromIsUser;

      // Detect zero-value contract interactions (approvals, etc.)
      if (!hasValueIn && !hasValueOut) {
        if (fromIsUser && txnFeeEth && txnFeeEth > 0) {
          transactions.push({
            type: "CONTRACT_APPROVAL",
            timestamp,
            notes: txhash ? `txhash:${txhash}` : undefined,
            feeAsset: nativeAsset,
            feeAmount: txnFeeEth,
            feeValueUsd:
              txnFeeUsd || (histPrice ? txnFeeEth * histPrice : undefined),
          });
        }
        continue;
      }

      const type = classifyEtherscanTx(from, to, addr);

      const tx: ParsedTransaction = {
        type,
        timestamp,
        notes: txhash ? `txhash:${txhash}` : undefined,
      };

      if (hasValueIn) {
        tx.receivedAsset = nativeAsset;
        tx.receivedAmount = valueIn;
        tx.receivedValueUsd = histPrice ? valueIn * histPrice : undefined;
      }

      if (hasValueOut) {
        tx.sentAsset = nativeAsset;
        tx.sentAmount = valueOut;
        tx.sentValueUsd = histPrice ? valueOut * histPrice : undefined;
      }

      // Gas fees (only charged to sender)
      if (fromIsUser && txnFeeEth && txnFeeEth > 0) {
        tx.feeAsset = nativeAsset;
        tx.feeAmount = txnFeeEth;
        tx.feeValueUsd =
          txnFeeUsd || (histPrice ? txnFeeEth * histPrice : undefined);
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
      totalRows: rows.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "etherscan" as any,
    },
  };
}

/**
 * Parse Etherscan ERC-20 token transfer CSV export.
 *
 * Expected columns:
 * "Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To",
 * "Value","TokenName","TokenSymbol","TokenDecimal"
 *
 * @param csv - Raw CSV string
 * @param userAddress - The user's wallet address
 */
export function parseEtherscanErc20Csv(
  csv: string,
  userAddress: string,
): CsvParseResult {
  const addr = userAddress.toLowerCase();
  const rows = parseCsvToObjects(csv);
  const transactions: ParsedTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const unixTs = row["unixtimestamp"];
      if (!unixTs) {
        errors.push({ row: rowNum, message: "Missing timestamp" });
        continue;
      }
      const timestamp = new Date(parseInt(unixTs) * 1000).toISOString();

      const from = (row["from"] || "").toLowerCase();
      const to = (row["to"] || "").toLowerCase();
      const symbol = (
        row["tokensymbol"] ||
        row["token symbol"] ||
        ""
      ).toUpperCase();
      const value = safeParseNumber(row["value"]);
      const decimals = parseInt(
        row["tokendecimal"] || row["token decimal"] || "18",
      );
      const txhash = row["txhash"] || "";

      if (!symbol || value === undefined) {
        errors.push({ row: rowNum, message: "Missing token symbol or value" });
        continue;
      }

      // Adjust value for token decimals (Etherscan exports raw values)
      const adjustedValue = value / Math.pow(10, decimals);

      const fromIsUser = from === addr;
      const toIsUser = to === addr;

      let type: ParsedTransaction["type"] = "UNKNOWN";
      if (fromIsUser && !toIsUser) type = "TRANSFER_OUT";
      if (!fromIsUser && toIsUser) type = "TRANSFER_IN";

      // Check for known DEX routers
      if (KNOWN_DEX_ROUTERS[to] || KNOWN_DEX_ROUTERS[from]) {
        type = "DEX_SWAP";
      }

      const tx: ParsedTransaction = {
        type,
        timestamp,
        notes: txhash ? `txhash:${txhash}` : undefined,
      };

      if (toIsUser) {
        tx.receivedAsset = symbol;
        tx.receivedAmount = adjustedValue;
      }
      if (fromIsUser) {
        tx.sentAsset = symbol;
        tx.sentAmount = adjustedValue;
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
      totalRows: rows.length,
      parsed: transactions.length,
      failed: errors.length,
      format: "etherscan" as any,
    },
  };
}
