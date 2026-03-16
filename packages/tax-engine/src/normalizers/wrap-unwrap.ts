/**
 * Wrap/Unwrap Normalizer
 *
 * Handles basis passthrough for token wrapping/unwrapping operations.
 * ETH → WETH, WETH → ETH, etc. are NOT taxable events.
 * The cost basis and acquisition date carry over 1:1.
 *
 * IRS treatment: Wrapping/unwrapping is a change of form, not substance.
 * No disposition occurs — the underlying asset remains the same.
 *
 * @license AGPL-3.0
 */

import type { TaxLot } from "../types";

/** Known wrap pairs: wrapped → underlying */
const WRAP_PAIRS: Record<string, string> = {
  WETH: "ETH",
  WBTC: "BTC",
  WMATIC: "MATIC",
  WAVAX: "AVAX",
  WBNB: "BNB",
  WFTM: "FTM",
  WSOL: "SOL",
  stETH: "ETH",
  cbETH: "ETH",
  rETH: "ETH",
};

/**
 * Check if two assets form a wrap/unwrap pair.
 * Returns true if converting between them should be non-taxable.
 */
export function isWrapPair(assetA: string, assetB: string): boolean {
  // Direct match: WETH↔ETH
  if (WRAP_PAIRS[assetA] === assetB) return true;
  if (WRAP_PAIRS[assetB] === assetA) return true;
  return false;
}

/**
 * Get the underlying asset for a wrapped token.
 * Returns the token itself if it's not a known wrapped token.
 */
export function getUnderlyingAsset(wrappedAsset: string): string {
  return WRAP_PAIRS[wrappedAsset] || wrappedAsset;
}

export interface WrapEvent {
  /** Unique ID */
  id: string;
  /** Source asset (e.g., 'ETH' for wrap, 'WETH' for unwrap) */
  fromAsset: string;
  /** Destination asset (e.g., 'WETH' for wrap, 'ETH' for unwrap) */
  toAsset: string;
  /** Amount (1:1 conversion) */
  amount: number;
  /** Gas/fee in USD (added to cost basis of resulting lot) */
  feeUsd: number;
  /** Timestamp of the wrap/unwrap */
  timestamp: Date;
  /** Source wallet/exchange ID */
  sourceId: string;
}

export interface WrapResult {
  /** Lots to remove (consumed from source asset) */
  consumedLotIds: string[];
  /** New lots to create (in destination asset, carrying over basis) */
  newLots: TaxLot[];
  /** Total basis carried over */
  basisCarriedOver: number;
  /** Fee added to basis */
  feeAdded: number;
}

/**
 * Process a wrap/unwrap event by transferring basis from source lots to new lots.
 * Consumes lots of the source asset (FIFO order) and creates equivalent lots
 * of the destination asset with the same cost basis + any gas fees.
 *
 * @param lots - All available tax lots (mutable — consumed lots will be modified)
 * @param event - The wrap/unwrap event details
 * @returns Result with consumed lot IDs and new lots to create
 */
export function processWrapUnwrap(
  lots: TaxLot[],
  event: WrapEvent,
): WrapResult {
  // Filter and sort lots of the source asset by acquisition date (FIFO)
  const sourceLots = lots
    .filter((l) => l.asset === event.fromAsset && l.amount > 0)
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

  let remaining = event.amount;
  const consumedLotIds: string[] = [];
  const newLots: TaxLot[] = [];
  let basisCarriedOver = 0;

  for (const lot of sourceLots) {
    if (remaining <= 0) break;

    const originalAmount = lot.amount;
    const consumed = Math.min(originalAmount, remaining);
    const ratio = consumed / originalAmount;
    const basisConsumed = lot.costBasisUsd * ratio;

    // Mutate the original lot (same pattern as calculator.ts)
    lot.amount -= consumed;
    lot.costBasisUsd -= basisConsumed;

    if (consumed >= originalAmount - 0.00000001) {
      consumedLotIds.push(lot.id);
    }

    // Create new lot in the destination asset with carried-over basis
    newLots.push({
      id: `${event.id}-wrap-${newLots.length}`,
      asset: event.toAsset,
      amount: consumed,
      costBasisUsd: basisConsumed,
      acquiredAt: lot.acquiredAt, // Preserve original acquisition date
      sourceId: event.sourceId,
    });

    basisCarriedOver += basisConsumed;
    remaining -= consumed;
  }

  // Distribute gas fee proportionally across new lots
  if (event.feeUsd > 0 && newLots.length > 0) {
    const totalAmount = newLots.reduce((s, l) => s + l.amount, 0);
    for (const lot of newLots) {
      const feeShare = event.feeUsd * (lot.amount / totalAmount);
      lot.costBasisUsd += feeShare;
    }
  }

  return {
    consumedLotIds,
    newLots,
    basisCarriedOver,
    feeAdded: event.feeUsd,
  };
}
