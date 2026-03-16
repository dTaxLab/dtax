/**
 * Pre-Audit Risk Scanner
 *
 * Analyzes a user's transaction portfolio for tax compliance risks.
 * Produces a scored risk report with actionable recommendations.
 *
 * Risk categories:
 * - missing_cost_basis: SELL/TRADE without corresponding acquisition lot
 * - wash_sale_risk: repurchase within 30 days of a loss
 * - unreported_income: staking/airdrop/mining without USD value
 * - high_value_unverified: large transactions with low AI confidence
 * - ai_low_confidence: AI-classified transactions with confidence <0.7
 * - duplicate_suspicious: same asset+amount+timestamp within window
 *
 * @license AGPL-3.0
 */

import type { TxType } from "@dtax/shared-types";

export type RiskCategory =
  | "missing_cost_basis"
  | "wash_sale_risk"
  | "unreported_income"
  | "high_value_unverified"
  | "ai_low_confidence"
  | "duplicate_suspicious";

export type RiskSeverity = "high" | "medium" | "low";

export interface RiskItem {
  category: RiskCategory;
  severity: RiskSeverity;
  description: string;
  affectedTransactionIds: string[];
  suggestedAction: string;
  potentialTaxImpact: number;
}

export interface RiskReport {
  taxYear: number;
  generatedAt: Date;
  overallScore: number;
  items: RiskItem[];
  summary: {
    high: number;
    medium: number;
    low: number;
    totalPotentialImpact: number;
  };
}

export interface RiskScanTransaction {
  id: string;
  type: TxType;
  timestamp: Date;
  sentAsset?: string;
  sentAmount?: number;
  sentValueUsd?: number;
  receivedAsset?: string;
  receivedAmount?: number;
  receivedValueUsd?: number;
  gainLoss?: number;
  costBasis?: number;
  aiClassified?: boolean;
  aiConfidence?: number;
}

const INCOME_TYPES: TxType[] = [
  "STAKING_REWARD",
  "MINING_REWARD",
  "AIRDROP",
  "INTEREST",
  "LP_REWARD",
  "FORK",
];

const DISPOSAL_TYPES: TxType[] = ["SELL", "TRADE", "DEX_SWAP", "NFT_SALE"];

const HIGH_VALUE_THRESHOLD = 10000; // $10,000
const AI_LOW_CONFIDENCE_THRESHOLD = 0.7;
const DUPLICATE_WINDOW_MS = 60 * 1000; // 60 seconds

/**
 * Scan transactions for tax compliance risks.
 */
export function scanRisks(
  transactions: RiskScanTransaction[],
  taxYear: number,
): RiskReport {
  const items: RiskItem[] = [];

  // Filter to tax year
  const yearTxs = transactions.filter((tx) => {
    const y = tx.timestamp.getFullYear();
    return y === taxYear;
  });

  // 1. Missing cost basis: disposals without cost basis
  const missingBasis = yearTxs.filter(
    (tx) =>
      DISPOSAL_TYPES.includes(tx.type) &&
      (tx.costBasis === undefined || tx.costBasis === null),
  );
  if (missingBasis.length > 0) {
    const impact = missingBasis.reduce(
      (s, tx) => s + (tx.sentValueUsd ?? 0),
      0,
    );
    items.push({
      category: "missing_cost_basis",
      severity: "high",
      description: `${missingBasis.length} disposal(s) missing cost basis. IRS may assume $0 basis, maximizing tax.`,
      affectedTransactionIds: missingBasis.map((tx) => tx.id),
      suggestedAction:
        "Import original acquisition records or manually set cost basis for these transactions.",
      potentialTaxImpact: impact,
    });
  }

  // 2. Wash sale risk: loss followed by same-asset buy within 30 days
  const losses = yearTxs.filter(
    (tx) =>
      DISPOSAL_TYPES.includes(tx.type) &&
      tx.gainLoss !== undefined &&
      tx.gainLoss < 0,
  );
  const washRiskIds: string[] = [];
  for (const loss of losses) {
    const lossAsset = loss.sentAsset;
    if (!lossAsset) continue;
    const lossTime = loss.timestamp.getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // IRS wash sale: 30 days BEFORE or AFTER the loss sale
    const repurchase = yearTxs.find(
      (tx) =>
        tx.id !== loss.id &&
        tx.receivedAsset === lossAsset &&
        Math.abs(tx.timestamp.getTime() - lossTime) <= thirtyDaysMs &&
        tx.timestamp.getTime() !== lossTime,
    );
    if (repurchase) {
      washRiskIds.push(loss.id);
    }
  }
  if (washRiskIds.length > 0) {
    const impact = losses
      .filter((l) => washRiskIds.includes(l.id))
      .reduce((s, tx) => s + Math.abs(tx.gainLoss ?? 0), 0);
    items.push({
      category: "wash_sale_risk",
      severity: "high",
      description: `${washRiskIds.length} loss disposition(s) may trigger wash sale rules (repurchase within 30 days).`,
      affectedTransactionIds: washRiskIds,
      suggestedAction:
        "Review wash sale detector results. Disallowed losses must be added to the replacement lot's cost basis.",
      potentialTaxImpact: impact,
    });
  }

  // 3. Unreported income: income types without USD value
  const unreportedIncome = yearTxs.filter(
    (tx) =>
      INCOME_TYPES.includes(tx.type) &&
      (!tx.receivedValueUsd || tx.receivedValueUsd === 0),
  );
  if (unreportedIncome.length > 0) {
    items.push({
      category: "unreported_income",
      severity: "medium",
      description: `${unreportedIncome.length} income transaction(s) missing USD value. Income must be reported at fair market value when received.`,
      affectedTransactionIds: unreportedIncome.map((tx) => tx.id),
      suggestedAction:
        "Use price backfill to fetch historical prices, or manually enter the USD value at time of receipt.",
      potentialTaxImpact: 0,
    });
  }

  // 4. High value + unverified AI: large txs with AI confidence < 0.9
  const highValueUnverified = yearTxs.filter(
    (tx) =>
      tx.aiClassified &&
      (tx.aiConfidence ?? 0) < 0.9 &&
      ((tx.sentValueUsd ?? 0) >= HIGH_VALUE_THRESHOLD ||
        (tx.receivedValueUsd ?? 0) >= HIGH_VALUE_THRESHOLD),
  );
  if (highValueUnverified.length > 0) {
    const impact = highValueUnverified.reduce(
      (s, tx) => s + Math.max(tx.sentValueUsd ?? 0, tx.receivedValueUsd ?? 0),
      0,
    );
    items.push({
      category: "high_value_unverified",
      severity: "high",
      description: `${highValueUnverified.length} high-value transaction(s) (>$10K) with unverified AI classification.`,
      affectedTransactionIds: highValueUnverified.map((tx) => tx.id),
      suggestedAction:
        "Manually verify the transaction type for these high-value transactions in the AI Review panel.",
      potentialTaxImpact: impact,
    });
  }

  // 5. AI low confidence: classified but confidence < 0.7
  const lowConfidence = yearTxs.filter(
    (tx) =>
      tx.aiClassified && (tx.aiConfidence ?? 0) < AI_LOW_CONFIDENCE_THRESHOLD,
  );
  if (lowConfidence.length > 0) {
    items.push({
      category: "ai_low_confidence",
      severity: "medium",
      description: `${lowConfidence.length} AI-classified transaction(s) with low confidence (<70%). Classification may be incorrect.`,
      affectedTransactionIds: lowConfidence.map((tx) => tx.id),
      suggestedAction:
        "Review these transactions in the AI Review panel and confirm or correct the classification.",
      potentialTaxImpact: 0,
    });
  }

  // 6. Duplicate suspicious: same asset+amount within 60s window
  const dupeIds = new Set<string>();
  for (let i = 0; i < yearTxs.length; i++) {
    for (let j = i + 1; j < yearTxs.length; j++) {
      const a = yearTxs[i];
      const b = yearTxs[j];
      if (
        a.type === b.type &&
        a.sentAsset === b.sentAsset &&
        a.sentAmount === b.sentAmount &&
        a.receivedAsset === b.receivedAsset &&
        a.receivedAmount === b.receivedAmount &&
        Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) <=
          DUPLICATE_WINDOW_MS
      ) {
        dupeIds.add(a.id);
        dupeIds.add(b.id);
      }
    }
  }
  if (dupeIds.size > 0) {
    items.push({
      category: "duplicate_suspicious",
      severity: "low",
      description: `${dupeIds.size} transaction(s) appear to be duplicates (same type, asset, amount within 60s).`,
      affectedTransactionIds: Array.from(dupeIds),
      suggestedAction:
        "Check if these are genuine separate transactions or accidental duplicates from import.",
      potentialTaxImpact: 0,
    });
  }

  // Calculate overall score
  const high = items.filter((i) => i.severity === "high").length;
  const medium = items.filter((i) => i.severity === "medium").length;
  const low = items.filter((i) => i.severity === "low").length;
  const totalImpact = items.reduce((s, i) => s + i.potentialTaxImpact, 0);
  const rawScore = 100 - (high * 15 + medium * 5 + low * 1);
  const overallScore = Math.max(0, Math.min(100, rawScore));

  return {
    taxYear,
    generatedAt: new Date(),
    overallScore,
    items,
    summary: {
      high,
      medium,
      low,
      totalPotentialImpact: Math.round(totalImpact * 100) / 100,
    },
  };
}
