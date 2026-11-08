/**
 * Core types for the DTax tax engine.
 * @license AGPL-3.0
 */

/** Supported cost basis calculation methods */
export type CostBasisMethod =
  | "FIFO"
  | "LIFO"
  | "HIFO"
  | "SPECIFIC_ID"
  | (string & {});

/**
 * Strategy interface for pluggable cost basis calculation methods.
 * Implement this to add new methods (e.g., weighted average, moving average).
 */
export interface CostBasisStrategy {
  /** Unique method name */
  readonly name: string;
  /** Calculate gains/losses for a taxable event */
  calculate(
    lots: TaxLot[],
    event: TaxableEvent,
    strictSilo?: boolean,
  ): CalculationResult;
}

/** Lot selection for Specific ID method */
export interface LotSelection {
  lotId: string;
  amount: number;
}

/** Holding period classification for tax purposes */
export type HoldingPeriod = "SHORT_TERM" | "LONG_TERM";

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
  /** Date the asset was acquired: decides the holding period and the date reported */
  acquiredAt: Date;
  /**
   * When the lot can first be matched, if earlier than `acquiredAt`. Set on a
   * lot moved by a transfer that arrived before the lot's recorded date (the
   * sending record only had a date). Ordering and eligibility use it; the
   * holding period and reports do not. Defaults to `acquiredAt`.
   */
  availableFrom?: Date;
  /** Identifier of the exchange or wallet holding this asset */
  sourceId: string;
  /** Human-readable source type */
  source?: string;
  /** Whether this lot was acquired as an NFT (ERC-721/1155 mint or purchase). Wash-sale rules do not apply but noted for user awareness. */
  isNft?: boolean;
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
  /** Identifier of the exchange or wallet executing this disposition */
  sourceId: string;
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
  /**
   * Portion of event.amount that had no matching acquisition lot, in asset
   * units (0 if fully matched). When > 0, the unmatched portion's proceeds
   * were included in gainLoss at $0 cost basis — the true gain/loss for
   * this disposal is unknown until the missing acquisition history is
   * imported. Surfaced to the user rather than silently assumed correct;
   * see the "incomplete cost basis" warning in the tax summary.
   */
  unmatchedAmount?: number;
}

/**
 * A lot that was matched to a taxable event.
 */
/**
 * A transfer of units between two of the taxpayer's own wallets or accounts.
 * Not a disposal: the units keep their acquisition date and cost and only
 * change wallet (26 CFR 1.1012-1(j)(1): the transfer date is disregarded).
 */
export interface TransferEvent {
  id: string;
  asset: string;
  /** Units that arrived in the destination wallet. */
  amount: number;
  /**
   * Units that left but did not arrive (the network fee). They are removed
   * from the sending wallet; their cost is not claimed.
   */
  feeAmount?: number;
  /** When the move takes effect: the units are in the receiving wallet from here on. */
  date: Date;
  /**
   * Latest acquisition time of a lot that may move, when it is later than
   * `date`. Set only when the sending record has just a date (its time of day
   * is a placeholder) and the arrival is earlier than that placeholder: the
   * units cannot have arrived before they were bought, so lots up to the
   * sending record's time move, available from `date` (see
   * TaxLot.availableFrom). Defaults to `date`.
   * Known limit: a sale from the sending wallet between the arrival and the
   * sending record's time finds the lots already moved, and a transfer that
   * feeds this wallet later the same day is applied after this one; both need
   * timestamps that disagree with each other, not just a missing time of day.
   */
  lotCutoff?: Date;
  fromSourceId: string;
  toSourceId: string;
}

/** HMRC matching rule that produced a UK share-pooling match. */
export type UkMatchRule = "SAME_DAY" | "THIRTY_DAY" | "SECTION_104";

export interface MatchedLot {
  /** Reference to the original lot */
  lotId: string;
  /** Amount consumed from this lot */
  amountConsumed: number;
  /** Cost basis for the consumed portion */
  costBasisUsd: number;
  /** Whether the lot was fully consumed */
  fullyConsumed: boolean;
  /**
   * UK share pooling only: which HMRC matching rule produced this match.
   * Same-day and 30-day matches use the actual acquisition cost of the lot;
   * SECTION_104 matches use the pool's weighted average cost.
   */
  rule?: UkMatchRule;
}
