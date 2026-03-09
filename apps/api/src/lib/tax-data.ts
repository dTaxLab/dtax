/**
 * Shared tax data fetching and mapping utilities.
 *
 * Eliminates duplication across tax routes (calculate, form8949, schedule-d, reconcile).
 */

import { prisma } from "./prisma";
import type { TaxLot, TaxableEvent } from "@dtax/tax-engine";

/** Transaction types that create tax lots (acquisitions) */
const ACQUISITION_TYPES = [
  "BUY",
  "TRADE",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "FORK",
  "GIFT_RECEIVED",
  "DEX_SWAP",
  "LP_WITHDRAWAL",
  "LP_REWARD",
  "NFT_MINT",
  "MARGIN_TRADE",
  "LIQUIDATION",
] as const;

/** Transaction types that trigger dispositions (taxable events) */
const DISPOSITION_TYPES = [
  "SELL",
  "TRADE",
  "GIFT_SENT",
  "LOST",
  "STOLEN",
  "DEX_SWAP",
  "LP_DEPOSIT",
  "NFT_PURCHASE",
  "NFT_SALE",
  "MARGIN_TRADE",
  "LIQUIDATION",
] as const;

/** Transaction types that count as ordinary income */
const INCOME_TYPES = [
  "STAKING_REWARD",
  "MINING_REWARD",
  "AIRDROP",
  "INTEREST",
  "LP_REWARD",
] as const;

export interface TaxDataParams {
  userId: string;
  taxYear: number;
}

export interface TaxData {
  lots: TaxLot[];
  events: TaxableEvent[];
  yearStart: Date;
  yearEnd: Date;
}

export interface IncomeBreakdown {
  staking: number;
  mining: number;
  airdrops: number;
  interest: number;
  total: number;
}

/**
 * Fetch acquisitions and dispositions for a tax year and map to engine types.
 */
export async function fetchTaxData({
  userId,
  taxYear,
}: TaxDataParams): Promise<TaxData> {
  const yearStart = new Date(`${taxYear}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${taxYear + 1}-01-01T00:00:00Z`);

  const [acquisitions, dispositions] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        type: { in: [...ACQUISITION_TYPES] },
        timestamp: { lt: yearEnd },
      },
      orderBy: { timestamp: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: { in: [...DISPOSITION_TYPES] },
        timestamp: { gte: yearStart, lt: yearEnd },
      },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  const lots: TaxLot[] = acquisitions.map((tx) => ({
    id: tx.id,
    asset: tx.receivedAsset || "",
    amount: Number(tx.receivedAmount || 0),
    costBasisUsd: Number(tx.receivedValueUsd || 0),
    acquiredAt: tx.timestamp,
    sourceId: tx.sourceId || "unknown",
  }));

  const events: TaxableEvent[] = dispositions.map((tx) => ({
    id: tx.id,
    asset: tx.sentAsset || "",
    amount: Number(tx.sentAmount || 0),
    proceedsUsd: Number(tx.sentValueUsd || 0),
    date: tx.timestamp,
    feeUsd: Number(tx.feeValueUsd || 0),
    sourceId: tx.sourceId || "unknown",
  }));

  return { lots, events, yearStart, yearEnd };
}

/**
 * Calculate ordinary income breakdown from acquisitions in a specific tax year.
 */
export async function calculateIncome({
  userId,
  taxYear,
}: TaxDataParams): Promise<IncomeBreakdown> {
  const yearStart = new Date(`${taxYear}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${taxYear + 1}-01-01T00:00:00Z`);

  const incomeItems = await prisma.transaction.findMany({
    where: {
      userId,
      type: { in: [...INCOME_TYPES] },
      timestamp: { gte: yearStart, lt: yearEnd },
    },
  });

  let staking = 0,
    mining = 0,
    airdrops = 0,
    interest = 0;
  for (const tx of incomeItems) {
    const val = Number(tx.receivedValueUsd || 0);
    if (tx.type === "STAKING_REWARD") staking += val;
    else if (tx.type === "MINING_REWARD") mining += val;
    else if (tx.type === "AIRDROP") airdrops += val;
    else interest += val; // INTEREST + LP_REWARD
  }

  return {
    staking,
    mining,
    airdrops,
    interest,
    total: staking + mining + airdrops + interest,
  };
}

/**
 * Fetch internal transfer IDs for reconciliation misclassification detection.
 */
export async function fetchInternalTransferIds(
  userId: string,
  yearStart: Date,
  yearEnd: Date,
): Promise<Set<string>> {
  const transfers = await prisma.transaction.findMany({
    where: {
      userId,
      type: "INTERNAL_TRANSFER",
      timestamp: { gte: yearStart, lt: yearEnd },
    },
    select: { externalId: true },
  });
  return new Set(
    transfers
      .map((t) => t.externalId)
      .filter((id): id is string => id !== null),
  );
}
