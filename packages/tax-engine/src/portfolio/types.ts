/**
 * Portfolio analysis and Tax-Loss Harvesting types.
 * @license AGPL-3.0
 */

/** Current market prices by asset symbol */
export type PriceMap = Map<string, number>;

/** Per-lot holding detail */
export interface LotHolding {
  lotId: string;
  asset: string;
  amount: number;
  costBasisUsd: number;
  costPerUnit: number;
  acquiredAt: Date;
  sourceId: string;
  /** Whether held > 1 year from reference date */
  isLongTerm: boolean;
  /** Unrealized gain/loss if current price provided */
  unrealizedGainLoss?: number;
  currentValueUsd?: number;
}

/** Aggregated position for a single asset */
export interface AssetPosition {
  asset: string;
  totalAmount: number;
  totalCostBasis: number;
  avgCostPerUnit: number;
  /** Current market price per unit (if provided) */
  currentPrice?: number;
  currentValueUsd?: number;
  unrealizedGainLoss?: number;
  unrealizedPct?: number;
  lotCount: number;
  /** Earliest acquisition date across lots */
  earliestAcquired: Date;
  /** Latest acquisition date across lots */
  latestAcquired: Date;
  /**
   * Holding period classification based on lot acquisition dates.
   * SHORT_TERM: all lots held ≤1 year; LONG_TERM: all held >1 year; MIXED: both.
   */
  holdingPeriod: "SHORT_TERM" | "LONG_TERM" | "MIXED";
  /** Individual lots */
  lots: LotHolding[];
}

/** Tax-Loss Harvesting opportunity */
export interface TlhOpportunity {
  asset: string;
  /** Total unrealized loss available */
  unrealizedLoss: number;
  /** Lots with unrealized losses */
  loseLots: LotHolding[];
  /** Total amount that could be sold */
  totalAmount: number;
  /** Total cost basis of loss lots */
  totalCostBasis: number;
  /** Current value of loss lots */
  currentValue: number;
  /** Whether any lots are short-term (wash sale risk if repurchased) */
  hasShortTermLots: boolean;
}

/** Full portfolio analysis result */
export interface PortfolioAnalysis {
  positions: AssetPosition[];
  totalCostBasis: number;
  totalCurrentValue?: number;
  totalUnrealizedGainLoss?: number;
  /** TLH opportunities (only when prices provided) */
  tlhOpportunities: TlhOpportunity[];
  /** Sum of all unrealized losses across TLH opportunities */
  totalTlhAvailable: number;
  /** Reference date for holding period calculations */
  asOfDate: Date;
}
