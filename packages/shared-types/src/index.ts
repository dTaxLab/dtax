/**
 * @dtax/shared-types
 *
 * Shared TypeScript type definitions used across
 * the DTax monorepo (frontend, backend, CLI, engine).
 *
 * @license AGPL-3.0
 */

// ============================================================
// Transaction Types (Unified format across all data sources)
// ============================================================

export type TxType =
  | "BUY"
  | "SELL"
  | "TRADE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "AIRDROP"
  | "STAKING_REWARD"
  | "MINING_REWARD"
  | "INTEREST"
  | "GIFT_RECEIVED"
  | "GIFT_SENT"
  | "LOST"
  | "STOLEN"
  | "FORK"
  | "MARGIN_TRADE"
  | "LIQUIDATION"
  | "INTERNAL_TRANSFER"
  // DeFi types
  | "DEX_SWAP"
  | "LP_DEPOSIT"
  | "LP_WITHDRAWAL"
  | "LP_REWARD"
  | "WRAP"
  | "UNWRAP"
  | "BRIDGE_OUT"
  | "BRIDGE_IN"
  | "CONTRACT_APPROVAL"
  // NFT types
  | "NFT_MINT"
  | "NFT_PURCHASE"
  | "NFT_SALE"
  | "UNKNOWN";

export interface Transaction {
  id: string;
  userId: string;

  // Source
  source: string;
  sourceId?: string;

  // Core fields
  type: TxType;
  timestamp: Date;

  // Asset info
  sentAsset?: string;
  sentAmount?: number;
  receivedAsset?: string;
  receivedAmount?: number;
  feeAsset?: string;
  feeAmount?: number;

  // USD values
  sentValueUsd?: number;
  receivedValueUsd?: number;
  feeValueUsd?: number;

  // AI classification
  aiClassified?: boolean;
  aiConfidence?: number;

  // Tax
  costBasis?: number;
  gainLoss?: number;
  holdingPeriod?: "SHORT_TERM" | "LONG_TERM";

  // Metadata
  notes?: string;
  tags?: string[];
  rawData?: Record<string, unknown>;
}

// ============================================================
// Portfolio Types
// ============================================================

export interface Holding {
  asset: string;
  amount: number;
  valueUsd: number;
  costBasisUsd: number;
  unrealizedGainLoss: number;
  percentage: number;
}

export interface PortfolioSummary {
  totalValueUsd: number;
  totalCostBasisUsd: number;
  totalUnrealizedGainLoss: number;
  holdings: Holding[];
  lastUpdated: Date;
}

// ============================================================
// Tax Report Types
// ============================================================

export interface TaxSummary {
  year: number;
  method:
    | "FIFO"
    | "LIFO"
    | "HIFO"
    | "SPECIFIC_ID"
    | "GERMANY_FIFO"
    | "PMPA"
    | "TOTAL_AVERAGE"
    | (string & {});
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  totalGains: number;
  totalLosses: number;
  netGainLoss: number;
  totalTransactions: number;
  incomeFromStaking: number;
  incomeFromMining: number;
  incomeFromAirdrops: number;
}

// ============================================================
// Subscription / Plan Types
// ============================================================

export type Plan = "FREE" | "PRO" | "CPA";

// ============================================================
// API Types
// ============================================================

export interface ApiResponse<T> {
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

export interface ApiListResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}
