/**
 * CSV Parser Types
 * @license AGPL-3.0
 */

/** Supported exchange CSV formats */
export type CsvFormat = 'generic' | 'coinbase' | 'binance' | 'binance_us' | 'kraken' | 'etherscan' | 'etherscan_erc20' | 'gemini' | 'crypto_com' | 'kucoin' | 'okx' | 'bybit' | 'gate' | 'bitget';

/** A parsed transaction row from CSV */
export interface ParsedTransaction {
    /** Transaction type */
    type: 'BUY' | 'SELL' | 'TRADE' | 'TRANSFER_IN' | 'TRANSFER_OUT' |
    'AIRDROP' | 'STAKING_REWARD' | 'MINING_REWARD' | 'INTEREST' |
    'GIFT_RECEIVED' | 'GIFT_SENT' |
    'DEX_SWAP' | 'LP_DEPOSIT' | 'LP_WITHDRAWAL' | 'LP_REWARD' |
    'WRAP' | 'UNWRAP' | 'BRIDGE_OUT' | 'BRIDGE_IN' | 'CONTRACT_APPROVAL' |
    'NFT_MINT' | 'NFT_PURCHASE' | 'NFT_SALE' |
    'UNKNOWN';
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
}
