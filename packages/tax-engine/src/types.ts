/**
 * Core types for the DTax tax engine.
 * @license AGPL-3.0
 */

/** Supported cost basis calculation methods */
export type CostBasisMethod = 'FIFO' | 'LIFO' | 'HIFO';

/** Holding period classification for tax purposes */
export type HoldingPeriod = 'SHORT_TERM' | 'LONG_TERM';

/**
 * A tax lot represents a specific acquisition of an asset.
 * Each purchase or receipt of crypto creates a new tax lot.
 */
export interface TaxLot {
    /** Unique identifier for the lot */
    id: string;
    /** Asset symbol (e.g., 'BTC', 'ETH') */
    asset: string;
    /** Amount of asset in the lot */
    amount: number;
    /** Total cost basis in USD */
    costBasisUsd: number;
    /** Date the asset was acquired */
    acquiredAt: Date;
    /** Source of the acquisition */
    source?: string;
}

/**
 * A taxable event (sale, trade, or disposition).
 */
export interface TaxableEvent {
    /** Unique identifier */
    id: string;
    /** Asset being disposed of */
    asset: string;
    /** Amount being disposed */
    amount: number;
    /** Total proceeds in USD */
    proceedsUsd: number;
    /** Date of the disposition */
    date: Date;
    /** Fee in USD */
    feeUsd?: number;
}

/**
 * Result of a tax calculation for a single event.
 */
export interface CalculationResult {
    /** The taxable event */
    event: TaxableEvent;
    /** Matched lots consumed (or partially consumed) */
    matchedLots: MatchedLot[];
    /** Total gain or loss in USD */
    gainLoss: number;
    /** Holding period (based on earliest matched lot) */
    holdingPeriod: HoldingPeriod;
    /** Cost basis method used */
    method: CostBasisMethod;
}

/**
 * A lot that was matched to a taxable event.
 */
export interface MatchedLot {
    /** Reference to the original lot */
    lotId: string;
    /** Amount consumed from this lot */
    amountConsumed: number;
    /** Cost basis for the consumed portion */
    costBasisUsd: number;
    /** Whether the lot was fully consumed */
    fullyConsumed: boolean;
}
