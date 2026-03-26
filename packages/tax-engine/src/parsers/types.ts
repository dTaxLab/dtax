/**
 * CSV Parser Types
 * @license AGPL-3.0
 */

import type { TxType } from "@dtax/shared-types";

/** Supported exchange CSV formats */
export type CsvFormat =
  | "generic"
  | "coinbase"
  | "binance"
  | "binance_us"
  | "kraken"
  | "etherscan"
  | "etherscan_erc20"
  | "gemini"
  | "crypto_com"
  | "kucoin"
  | "okx"
  | "bybit"
  | "gate"
  | "bitget"
  | "mexc"
  | "htx"
  | "solscan"
  | "solscan_defi"
  | "bitfinex"
  | "poloniex"
  | "koinly"
  | "cointracker"
  | "cryptact";

/** A parsed transaction row from CSV */
export interface ParsedTransaction {
  /** Transaction type */
  type: TxType;
  /** ISO timestamp */
  timestamp: string;
  /** Received asset symbol */
  receivedAsset?: string;
  /** Received amount */
  receivedAmount?: number;
  /** Received value in USD */
  receivedValueUsd?: number;
  /** Sent asset symbol */
  sentAsset?: string;
  /** Sent amount */
  sentAmount?: number;
  /** Sent value in USD */
  sentValueUsd?: number;
  /** Fee asset */
  feeAsset?: string;
  /** Fee amount */
  feeAmount?: number;
  /** Fee in USD */
  feeValueUsd?: number;
  /** Optional notes/memo */
  notes?: string;
  /** Data source name (e.g. "Binance", "Coinbase") */
  source?: string;
  /** Blockchain name (e.g. "ethereum", "solana") */
  chain?: string;
  /** Token contract address (e.g. ERC-20/NFT contract) */
  contractAddress?: string;
}

/** Result of a CSV parse operation */
export interface CsvParseResult {
  /** Successfully parsed transactions */
  transactions: ParsedTransaction[];
  /** Rows that failed to parse */
  errors: CsvParseError[];
  /** Summary statistics */
  summary: {
    totalRows: number;
    parsed: number;
    failed: number;
    format: CsvFormat;
  };
}

/** Error for a single row that failed */
export interface CsvParseError {
  /** 1-indexed row number */
  row: number;
  /** Error message */
  message: string;
  /** The raw row data */
  rawData?: string;
}

/** Column mapping for generic CSV format */
export interface GenericColumnMap {
  type?: string;
  timestamp: string;
  receivedAsset?: string;
  receivedAmount?: string;
  receivedValueUsd?: string;
  sentAsset?: string;
  sentAmount?: string;
  sentValueUsd?: string;
  feeAsset?: string;
  feeAmount?: string;
  feeValueUsd?: string;
  notes?: string;
  source?: string;
  chain?: string;
  contractAddress?: string;
}
