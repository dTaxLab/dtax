/**
 * 1099-DA Reconciliation Engine
 *
 * Compares exchange-reported 1099-DA entries against DTax's
 * own calculated dispositions to find discrepancies and generate
 * rebuttal suggestions.
 *
 * Matching strategy:
 * 1. Exact match by asset + date + proceeds (within tolerance)
 * 2. Fuzzy match by asset + date range (±2 days) + proceeds range (±5%)
 * 3. Remaining entries marked as missing
 *
 * @license AGPL-3.0
 */

import type {
  Form1099DAEntry,
  DtaxDisposition,
  ReconciliationItem,
  ReconciliationReport,
  MatchStatus,
} from "./types";

const PROCEEDS_TOLERANCE = 0.01; // $0.01 exact match threshold
const FUZZY_DATE_MS = 2 * 24 * 60 * 60 * 1000; // ±2 days
const FUZZY_PROCEEDS_RATIO = 0.05; // ±5%

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function withinDateRange(a: Date, b: Date, rangeMs: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= rangeMs;
}

function withinProceedsRange(a: number, b: number, ratio: number): boolean {
  if (a === 0 && b === 0) return true;
  const max = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= max * ratio;
}

function determineStatus(
  broker: Form1099DAEntry,
  dtax: DtaxDisposition,
): MatchStatus {
  const proceedsMatch =
    Math.abs(broker.grossProceeds - dtax.proceeds) <= PROCEEDS_TOLERANCE;
  const basisMatch =
    broker.costBasis === undefined ||
    Math.abs(broker.costBasis - dtax.costBasis) <= PROCEEDS_TOLERANCE;

  if (proceedsMatch && basisMatch) return "matched";
  if (!proceedsMatch && !basisMatch && broker.costBasis !== undefined)
    return "both_mismatch";
  if (!proceedsMatch) return "proceeds_mismatch";
  return "basis_mismatch";
}

function generateRebuttal(item: ReconciliationItem): string | undefined {
  switch (item.status) {
    case "matched":
      return undefined;
    case "proceeds_mismatch":
      return (
        `Proceeds differ by $${Math.abs(item.proceedsDiff).toFixed(2)}. ` +
        `Verify transaction timing and exchange rate used. The broker may have used a different valuation timestamp.`
      );
    case "basis_mismatch":
      return (
        `Cost basis differs by $${Math.abs(item.costBasisDiff).toFixed(2)}. ` +
        `This may be due to the broker not tracking transfers between wallets. ` +
        `Maintain records of original acquisition costs and transfer history.`
      );
    case "both_mismatch":
      return (
        `Both proceeds ($${Math.abs(item.proceedsDiff).toFixed(2)}) and cost basis ($${Math.abs(item.costBasisDiff).toFixed(2)}) differ. ` +
        `Review the full transaction history. The broker may be using a different cost basis method.`
      );
    case "missing_in_dtax":
      return (
        `Transaction reported by broker but not found in your records. ` +
        `Check if this was imported correctly or if it was an overlooked transaction.`
      );
    case "missing_in_1099da":
      return (
        `Transaction in your records but not on 1099-DA. ` +
        `This may be a DeFi/on-chain transaction not reported by the broker. ` +
        `Report on Form 8949 Box C (short-term) or Box F (long-term).`
      );
    case "internal_transfer_misclassified":
      return (
        `The broker reported this as a taxable disposition, but DTax classified it as an internal transfer. ` +
        `Prepare documentation (wallet addresses, timestamps) showing this was a transfer between your own accounts. ` +
        `You may file with adjusted basis and attach an explanatory statement.`
      );
    default:
      return undefined;
  }
}

/**
 * Classify whether a broker entry represents a "covered" or "noncovered" security.
 * Starting 2026, brokers must report cost basis for "covered" securities:
 * assets bought on/after Jan 1, 2026 AND kept on the same exchange until sold.
 */
function classifyCoverage(
  brokerEntry: Form1099DAEntry | null,
): "covered" | "noncovered" | "unknown" {
  if (!brokerEntry) return "unknown";

  // If broker didn't provide cost basis, it's noncovered
  if (brokerEntry.costBasis == null || brokerEntry.costBasis === 0) {
    return "noncovered";
  }

  // If acquired before 2026-01-01, it's noncovered
  if (brokerEntry.dateAcquired) {
    const cutoff = new Date("2026-01-01");
    if (brokerEntry.dateAcquired < cutoff) {
      return "noncovered";
    }
    return "covered";
  }

  // No acquisition date = likely transferred in = noncovered
  return "noncovered";
}

export interface ReconcileOptions {
  taxYear: number;
  brokerName: string;
  /** DTax-recognized internal transfer IDs to check for misclassification */
  internalTransferIds?: Set<string>;
}

/**
 * Reconcile 1099-DA entries against DTax dispositions.
 */
export function reconcile(
  brokerEntries: Form1099DAEntry[],
  dtaxDispositions: DtaxDisposition[],
  options: ReconcileOptions,
): ReconciliationReport {
  const items: ReconciliationItem[] = [];
  const usedBrokerIndices = new Set<number>();
  const usedDtaxIndices = new Set<number>();

  // Phase 1: Exact matching (same asset + same day + proceeds within tolerance)
  for (let bi = 0; bi < brokerEntries.length; bi++) {
    if (usedBrokerIndices.has(bi)) continue;
    const broker = brokerEntries[bi];

    for (let di = 0; di < dtaxDispositions.length; di++) {
      if (usedDtaxIndices.has(di)) continue;
      const dtax = dtaxDispositions[di];

      if (
        broker.asset === dtax.asset &&
        isSameDay(broker.dateSold, dtax.dateSold) &&
        Math.abs(broker.grossProceeds - dtax.proceeds) <= PROCEEDS_TOLERANCE
      ) {
        const status = determineStatus(broker, dtax);
        const item: ReconciliationItem = {
          status,
          brokerEntry: broker,
          dtaxEntry: dtax,
          proceedsDiff: broker.grossProceeds - dtax.proceeds,
          costBasisDiff: (broker.costBasis ?? dtax.costBasis) - dtax.costBasis,
          gainLossDiff: (broker.gainLoss ?? dtax.gainLoss) - dtax.gainLoss,
          coverageStatus: classifyCoverage(broker),
        };
        item.rebuttalSuggestion = generateRebuttal(item);
        items.push(item);
        usedBrokerIndices.add(bi);
        usedDtaxIndices.add(di);
        break;
      }
    }
  }

  // Phase 2: Fuzzy matching (same asset + date range + proceeds range)
  for (let bi = 0; bi < brokerEntries.length; bi++) {
    if (usedBrokerIndices.has(bi)) continue;
    const broker = brokerEntries[bi];

    let bestMatch = -1;
    let bestScore = Infinity;

    for (let di = 0; di < dtaxDispositions.length; di++) {
      if (usedDtaxIndices.has(di)) continue;
      const dtax = dtaxDispositions[di];

      if (
        broker.asset === dtax.asset &&
        withinDateRange(broker.dateSold, dtax.dateSold, FUZZY_DATE_MS) &&
        withinProceedsRange(
          broker.grossProceeds,
          dtax.proceeds,
          FUZZY_PROCEEDS_RATIO,
        )
      ) {
        const score =
          Math.abs(broker.grossProceeds - dtax.proceeds) +
          Math.abs(broker.dateSold.getTime() - dtax.dateSold.getTime()) /
            (24 * 60 * 60 * 1000);

        if (score < bestScore) {
          bestScore = score;
          bestMatch = di;
        }
      }
    }

    if (bestMatch >= 0) {
      const dtax = dtaxDispositions[bestMatch];
      const status = determineStatus(broker, dtax);
      const item: ReconciliationItem = {
        status,
        brokerEntry: broker,
        dtaxEntry: dtax,
        proceedsDiff: broker.grossProceeds - dtax.proceeds,
        costBasisDiff: (broker.costBasis ?? dtax.costBasis) - dtax.costBasis,
        gainLossDiff: (broker.gainLoss ?? dtax.gainLoss) - dtax.gainLoss,
        coverageStatus: classifyCoverage(broker),
      };
      item.rebuttalSuggestion = generateRebuttal(item);
      items.push(item);
      usedBrokerIndices.add(bi);
      usedDtaxIndices.add(bestMatch);
    }
  }

  // Phase 3: Unmatched broker entries → check for internal transfer misclassification
  const internalTransferIds = options.internalTransferIds ?? new Set();

  for (let bi = 0; bi < brokerEntries.length; bi++) {
    if (usedBrokerIndices.has(bi)) continue;
    const broker = brokerEntries[bi];

    // Check if this broker entry might correspond to an internal transfer
    const isInternalTransfer = broker.transactionId
      ? internalTransferIds.has(broker.transactionId)
      : false;

    const status: MatchStatus = isInternalTransfer
      ? "internal_transfer_misclassified"
      : "missing_in_dtax";

    const item: ReconciliationItem = {
      status,
      brokerEntry: broker,
      dtaxEntry: null,
      proceedsDiff: broker.grossProceeds,
      costBasisDiff: broker.costBasis ?? 0,
      gainLossDiff: broker.gainLoss ?? 0,
      coverageStatus: classifyCoverage(broker),
    };
    item.rebuttalSuggestion = generateRebuttal(item);
    items.push(item);
  }

  // Phase 4: Unmatched DTax entries → missing in 1099-DA
  for (let di = 0; di < dtaxDispositions.length; di++) {
    if (usedDtaxIndices.has(di)) continue;
    const dtax = dtaxDispositions[di];

    const item: ReconciliationItem = {
      status: "missing_in_1099da",
      brokerEntry: null,
      dtaxEntry: dtax,
      proceedsDiff: -dtax.proceeds,
      costBasisDiff: -dtax.costBasis,
      gainLossDiff: -dtax.gainLoss,
      coverageStatus: "unknown",
    };
    item.rebuttalSuggestion = generateRebuttal(item);
    items.push(item);
  }

  // Noncovered entries with no reported cost basis — IRS will default to $0 basis
  const basisMissingItems = items.filter(
    (i) =>
      i.coverageStatus === "noncovered" &&
      i.brokerEntry !== null &&
      (i.brokerEntry.costBasis == null || i.brokerEntry.costBasis === 0),
  );
  // Worst-case: IRS taxes full proceeds at top marginal short-term rate (37%)
  const estimatedTaxOverpayment =
    Math.round(
      basisMissingItems.reduce(
        (sum, i) => sum + (i.brokerEntry?.grossProceeds ?? 0),
        0,
      ) * 37,
    ) / 100;

  // Build summary
  const summary = {
    totalBrokerEntries: brokerEntries.length,
    totalDtaxDispositions: dtaxDispositions.length,
    matched: items.filter((i) => i.status === "matched").length,
    proceedsMismatch: items.filter((i) => i.status === "proceeds_mismatch")
      .length,
    basisMismatch: items.filter((i) => i.status === "basis_mismatch").length,
    bothMismatch: items.filter((i) => i.status === "both_mismatch").length,
    missingInDtax: items.filter((i) => i.status === "missing_in_dtax").length,
    missingIn1099da: items.filter((i) => i.status === "missing_in_1099da")
      .length,
    internalTransferMisclassified: items.filter(
      (i) => i.status === "internal_transfer_misclassified",
    ).length,
    netProceedsDiff:
      Math.round(items.reduce((s, i) => s + i.proceedsDiff, 0) * 100) / 100,
    netGainLossDiff:
      Math.round(items.reduce((s, i) => s + i.gainLossDiff, 0) * 100) / 100,
    coveredCount: items.filter((i) => i.coverageStatus === "covered").length,
    noncoveredCount: items.filter((i) => i.coverageStatus === "noncovered")
      .length,
    basisMissingCount: basisMissingItems.length,
    estimatedTaxOverpayment,
  };

  return {
    taxYear: options.taxYear,
    brokerName: options.brokerName,
    summary,
    items,
  };
}
