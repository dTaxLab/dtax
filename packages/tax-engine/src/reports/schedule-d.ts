/**
 * IRS Schedule D (Form 1040) Generator
 *
 * Schedule D summarizes capital gains and losses from Form 8949.
 * It aggregates totals from each Box type into two sections:
 *   Part I: Short-term (lines 1-7)
 *   Part II: Long-term (lines 8-15)
 *
 * Key lines:
 *   Line 1a-3: Short-term from Form 8949 (Box A, B, C)
 *   Line 7:    Net short-term capital gain or loss
 *   Line 8a-10: Long-term from Form 8949 (Box D, E, F)
 *   Line 15:   Net long-term capital gain or loss
 *   Line 16:   Combined net gain or loss
 *   Line 21:   If loss, smaller of loss or $3,000 limit
 *   Line 22:   Qualified dividends worksheet (not applicable for crypto)
 *
 * @license AGPL-3.0
 */

import type { Form8949Report, Form8949BoxSummary } from "./form8949";

/** A single line on Schedule D */
export interface ScheduleDLine {
  /** Line number (e.g., "1a", "7", "16") */
  lineNumber: string;
  /** Description */
  description: string;
  /** Column (d): Proceeds */
  proceeds: number;
  /** Column (e): Cost basis */
  costBasis: number;
  /** Column (g): Adjustments from Form 8949 */
  adjustments: number;
  /** Column (h): Gain or loss */
  gainLoss: number;
}

/** Complete Schedule D report */
export interface ScheduleDReport {
  taxYear: number;
  /** Part I: Short-term lines */
  partI: ScheduleDLine[];
  /** Part II: Long-term lines */
  partII: ScheduleDLine[];
  /** Line 7: Net short-term gain/loss */
  netShortTerm: number;
  /** Line 15: Net long-term gain/loss */
  netLongTerm: number;
  /** Line 16: Combined net gain/loss (line 7 + line 15) */
  combinedNetGainLoss: number;
  /** Line 21: Capital loss deduction limit ($3,000 max for individuals) */
  capitalLossDeduction: number;
  /** Carryover loss (excess beyond $3,000 limit, carries to next year) */
  carryoverLoss: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getBoxSummary(
  boxSummaries: Form8949BoxSummary[],
  box: string,
): {
  proceeds: number;
  costBasis: number;
  adjustments: number;
  gainLoss: number;
} {
  const summary = boxSummaries.find((s) => s.box === box);
  if (!summary)
    return { proceeds: 0, costBasis: 0, adjustments: 0, gainLoss: 0 };
  return {
    proceeds: summary.totalProceeds,
    costBasis: summary.totalCostBasis,
    adjustments: summary.totalAdjustments,
    gainLoss: summary.totalGainLoss,
  };
}

/**
 * Generate Schedule D from a Form 8949 report.
 *
 * @param form8949 - Completed Form 8949 report
 * @param options - Additional options
 */
export function generateScheduleD(
  form8949: Form8949Report,
  options?: {
    /** Capital loss deduction limit (default $3,000 for individual filers) */
    lossLimit?: number;
  },
): ScheduleDReport {
  const lossLimit = options?.lossLimit ?? 3000;

  // Part I: Short-term (Boxes A, B, C)
  const boxA = getBoxSummary(form8949.boxSummaries, "A");
  const boxB = getBoxSummary(form8949.boxSummaries, "B");
  const boxC = getBoxSummary(form8949.boxSummaries, "C");

  const partI: ScheduleDLine[] = [
    {
      lineNumber: "1a",
      description: "Short-term from Form 8949, Box A (basis reported to IRS)",
      ...boxA,
    },
    {
      lineNumber: "2",
      description:
        "Short-term from Form 8949, Box B (basis NOT reported to IRS)",
      ...boxB,
    },
    {
      lineNumber: "3",
      description: "Short-term from Form 8949, Box C (not reported on 1099-B)",
      ...boxC,
    },
  ];

  const netShortTerm = round2(boxA.gainLoss + boxB.gainLoss + boxC.gainLoss);

  // Part II: Long-term (Boxes D, E, F)
  const boxD = getBoxSummary(form8949.boxSummaries, "D");
  const boxE = getBoxSummary(form8949.boxSummaries, "E");
  const boxF = getBoxSummary(form8949.boxSummaries, "F");

  const partII: ScheduleDLine[] = [
    {
      lineNumber: "8a",
      description: "Long-term from Form 8949, Box D (basis reported to IRS)",
      ...boxD,
    },
    {
      lineNumber: "9",
      description:
        "Long-term from Form 8949, Box E (basis NOT reported to IRS)",
      ...boxE,
    },
    {
      lineNumber: "10",
      description: "Long-term from Form 8949, Box F (not reported on 1099-B)",
      ...boxF,
    },
  ];

  const netLongTerm = round2(boxD.gainLoss + boxE.gainLoss + boxF.gainLoss);

  // Line 16: Combined
  const combinedNetGainLoss = round2(netShortTerm + netLongTerm);

  // Line 21: Capital loss deduction (max $3,000 for individuals, $1,500 MFS)
  let capitalLossDeduction = 0;
  let carryoverLoss = 0;

  if (combinedNetGainLoss < 0) {
    capitalLossDeduction = Math.min(Math.abs(combinedNetGainLoss), lossLimit);
    carryoverLoss = round2(
      Math.abs(combinedNetGainLoss) - capitalLossDeduction,
    );
  }

  return {
    taxYear: form8949.taxYear,
    partI,
    partII,
    netShortTerm,
    netLongTerm,
    combinedNetGainLoss,
    capitalLossDeduction,
    carryoverLoss,
  };
}
