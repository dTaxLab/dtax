/**
 * Map parsed CSV rows to the calculator's inputs.
 *
 * A row that acquires coins becomes a lot; a row that gives coins up becomes a
 * taxable event. Shared by the command line and the MCP server, so the two
 * cannot drift apart.
 *
 * Transfers are NOT paired here: a transfer in is an acquisition and a transfer
 * out is a disposal at the value in the file. Pairing transfers between a
 * person's own wallets needs wallet-level data a CSV does not carry; callers
 * should tell their users when transfers are present.
 *
 * @license AGPL-3.0
 */

import type { TaxLot, TaxableEvent } from "./types";
import type { ParsedTransaction } from "./parsers/types";

/** A parsed row as an acquisition lot, or null if it is not one. */
export function parsedToLot(
  tx: ParsedTransaction,
  index: number,
): TaxLot | null {
  const t = tx.type;
  const isAcquisition =
    t === "BUY" ||
    t === "AIRDROP" ||
    t === "STAKING_REWARD" ||
    t === "MINING_REWARD" ||
    t === "INTEREST" ||
    t === "GIFT_RECEIVED" ||
    t === "TRANSFER_IN";

  // TRADE has a received side (acquisition)
  const isTradeBuy = t === "TRADE" && tx.receivedAsset && tx.receivedAmount;

  if (!isAcquisition && !isTradeBuy) return null;

  const asset = tx.receivedAsset;
  const amount = tx.receivedAmount;
  const costBasis = tx.receivedValueUsd ?? 0;

  if (!asset || !amount || amount <= 0) return null;

  return {
    id: `lot-${index}`,
    asset,
    amount,
    costBasisUsd: costBasis,
    acquiredAt: new Date(tx.timestamp),
    sourceId: "csv",
  };
}

/** A parsed row as a disposition, or null if it is not one (optionally only for one year). */
export function parsedToEvent(
  tx: ParsedTransaction,
  index: number,
  yearFilter?: number,
): TaxableEvent | null {
  const t = tx.type;
  const isDisposition =
    t === "SELL" || t === "GIFT_SENT" || t === "TRANSFER_OUT";

  // TRADE has a sent side (disposition)
  const isTradeSell = t === "TRADE" && tx.sentAsset && tx.sentAmount;

  if (!isDisposition && !isTradeSell) return null;

  const asset = tx.sentAsset;
  const amount = tx.sentAmount;
  const proceeds = tx.sentValueUsd ?? 0;

  if (!asset || !amount || amount <= 0) return null;

  const eventDate = new Date(tx.timestamp);
  if (yearFilter && eventDate.getUTCFullYear() !== yearFilter) return null;

  return {
    id: `evt-${index}`,
    asset,
    amount,
    proceedsUsd: proceeds,
    date: eventDate,
    feeUsd: tx.feeValueUsd ?? 0,
    sourceId: "csv",
  };
}
