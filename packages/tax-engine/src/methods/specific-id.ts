/**
 * Specific ID Tax Calculation Method.
 *
 * The taxpayer explicitly selects which lots to dispose of.
 * IRS requires contemporaneous identification (before or at the time of sale).
 * This is reported as "Specific Identification" on Form 8949.
 *
 * @license AGPL-3.0
 */

import type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  MatchedLot,
  LotSelection,
} from "../types";
import { getHoldingPeriod } from "./shared";

/**
 * Calculate capital gains/losses using the Specific ID method.
 *
 * @param lots - Available tax lots
 * @param event - The taxable event (sale/trade)
 * @param selections - User-specified lot selections (lotId + amount)
 * @returns CalculationResult with gains/losses and matched lots
 */
export function calculateSpecificId(
  lots: TaxLot[],
  event: TaxableEvent,
  selections: LotSelection[],
): CalculationResult {
  const lotMap = new Map(lots.map((l) => [l.id, l]));
  const matchedLots: MatchedLot[] = [];
  let totalCostBasis = 0;
  let totalSelected = 0;
  let earliestLotDate: Date | null = null;

  for (const sel of selections) {
    const lot = lotMap.get(sel.lotId);
    if (!lot) {
      throw new Error(`Lot ${sel.lotId} not found`);
    }
    if (lot.asset !== event.asset) {
      throw new Error(
        `Lot ${sel.lotId} asset ${lot.asset} does not match event asset ${event.asset}`,
      );
    }
    if (sel.amount > lot.amount + 0.00000001) {
      throw new Error(
        `Lot ${sel.lotId} has ${lot.amount} available, requested ${sel.amount}`,
      );
    }

    const consumeAmount = Math.min(sel.amount, lot.amount);
    const costPerUnit =
      lot.amount > 0.00000001 ? lot.costBasisUsd / lot.amount : 0;
    const consumedCostBasis = costPerUnit * consumeAmount;
    const fullyConsumed = consumeAmount >= lot.amount - 0.00000001;

    matchedLots.push({
      lotId: lot.id,
      amountConsumed: consumeAmount,
      costBasisUsd: consumedCostBasis,
      fullyConsumed,
    });

    lot.amount -= consumeAmount;
    lot.costBasisUsd -= consumedCostBasis;
    totalCostBasis += consumedCostBasis;
    totalSelected += consumeAmount;

    if (!earliestLotDate || lot.acquiredAt < earliestLotDate) {
      earliestLotDate = lot.acquiredAt;
    }
  }

  if (Math.abs(totalSelected - event.amount) > 0.00000001) {
    throw new Error(
      `Selected amount ${totalSelected} does not match event amount ${event.amount}`,
    );
  }

  const feeUsd = event.feeUsd ?? 0;
  const gainLoss = event.proceedsUsd - totalCostBasis - feeUsd;
  const holdingPeriod = earliestLotDate
    ? getHoldingPeriod(earliestLotDate, event.date)
    : "SHORT_TERM";

  return {
    event,
    matchedLots,
    gainLoss,
    holdingPeriod,
    method: "SPECIFIC_ID",
  };
}
