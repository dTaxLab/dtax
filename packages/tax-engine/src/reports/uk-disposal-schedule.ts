/**
 * UK disposal schedule: one row per matched lot of each disposal, showing which
 * HMRC rule (same-day, 30-day or Section 104 pool) set the allowable cost,
 * plus the totals a Capital Gains Tax summary asks for.
 *
 * Amounts are in the currency the transactions were valued in (USD in dTax).
 * HMRC requires sterling: convert before filing. This report does not.
 *
 * @license AGPL-3.0
 */

import type { CalculationResult } from "../types";
import { ukDateString } from "../methods/shared";
import { dadd, dsub, dmul, ddiv } from "../math";

export interface UkDisposalRow {
  disposalId: string;
  disposalDate: string;
  asset: string;
  /** Quantity of the disposal covered by this match. */
  quantity: number;
  /** Disposal proceeds apportioned to this match, before fees. */
  proceeds: number;
  /** Allowable acquisition cost of this match. */
  allowableCost: number;
  /** Disposal fee apportioned to this match. */
  fees: number;
  gainLoss: number;
  rule: "SAME_DAY" | "THIRTY_DAY" | "SECTION_104" | "UNMATCHED";
  /** UK date the matched lot was acquired; empty when unknown or unmatched. */
  acquiredOn: string;
  lotId: string;
}

export interface UkDisposalSummary {
  numberOfDisposals: number;
  totalProceeds: number;
  totalAllowableCosts: number;
  totalGains: number;
  totalLosses: number;
  netGainLoss: number;
}

export interface UkDisposalSchedule {
  rows: UkDisposalRow[];
  summary: UkDisposalSummary;
}

/**
 * Build the schedule from UK share pooling results.
 *
 * @param results - Results calculated with UK_SHARE_POOLING
 * @param lotDates - Acquisition time per lot id
 */
export function generateUkDisposalSchedule(
  results: CalculationResult[],
  lotDates: Map<string, Date>,
): UkDisposalSchedule {
  const rows: UkDisposalRow[] = [];
  let totalProceeds = 0;
  let totalAllowableCosts = 0;
  let totalGains = 0;
  let totalLosses = 0;

  for (const r of results) {
    const e = r.event;
    const date = ukDateString(e.date);
    const fee = e.feeUsd ?? 0;
    const unmatched = r.unmatchedAmount ?? 0;
    // value x part / whole keeps decimals exact (no x/3*3 drift)
    const part = (value: number, amount: number) =>
      e.amount > 0 ? ddiv(dmul(value, amount), e.amount) : 0;

    for (const m of r.matchedLots) {
      const proceeds = part(e.proceedsUsd, m.amountConsumed);
      const fees = part(fee, m.amountConsumed);
      rows.push({
        disposalId: e.id,
        disposalDate: date,
        asset: e.asset,
        quantity: m.amountConsumed,
        proceeds,
        allowableCost: m.costBasisUsd,
        fees,
        gainLoss: dsub(dsub(proceeds, m.costBasisUsd), fees),
        rule: m.rule ?? "SECTION_104",
        acquiredOn: lotDates.has(m.lotId)
          ? ukDateString(lotDates.get(m.lotId) as Date)
          : "",
        lotId: m.lotId,
      });
    }
    if (unmatched > 0) {
      const proceeds = part(e.proceedsUsd, unmatched);
      const fees = part(fee, unmatched);
      rows.push({
        disposalId: e.id,
        disposalDate: date,
        asset: e.asset,
        quantity: unmatched,
        proceeds,
        allowableCost: 0,
        fees,
        gainLoss: dsub(proceeds, fees),
        rule: "UNMATCHED",
        acquiredOn: "",
        lotId: "",
      });
    }

    totalProceeds = dadd(totalProceeds, e.proceedsUsd);
    totalAllowableCosts = dadd(
      totalAllowableCosts,
      dadd(
        r.matchedLots.reduce((n, m) => dadd(n, m.costBasisUsd), 0),
        fee,
      ),
    );
    if (r.gainLoss >= 0) totalGains = dadd(totalGains, r.gainLoss);
    else totalLosses = dadd(totalLosses, -r.gainLoss);
  }

  return {
    rows,
    summary: {
      numberOfDisposals: results.length,
      totalProceeds,
      totalAllowableCosts,
      totalGains,
      totalLosses,
      netGainLoss: dsub(totalGains, totalLosses),
    },
  };
}

const HEADER = [
  "Disposal ID",
  "Disposal date (UK)",
  "Asset",
  "Quantity",
  "Proceeds",
  "Allowable cost",
  "Fees",
  "Gain/Loss",
  "HMRC rule",
  "Acquired on (UK)",
  "Lot ID",
];

function cell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formulas in text coming from imported data
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Render the schedule as CSV, rows first and the totals block after. */
export function ukDisposalScheduleToCsv(schedule: UkDisposalSchedule): string {
  const lines = [HEADER.join(",")];
  for (const r of schedule.rows) {
    lines.push(
      [
        r.disposalId,
        r.disposalDate,
        r.asset,
        r.quantity,
        r.proceeds,
        r.allowableCost,
        r.fees,
        r.gainLoss,
        r.rule,
        r.acquiredOn,
        r.lotId,
      ]
        .map(cell)
        .join(","),
    );
  }
  const s = schedule.summary;
  lines.push("");
  lines.push(["Number of disposals", s.numberOfDisposals].map(cell).join(","));
  lines.push(["Total disposal proceeds", s.totalProceeds].map(cell).join(","));
  lines.push(
    ["Total allowable costs (incl. fees)", s.totalAllowableCosts]
      .map(cell)
      .join(","),
  );
  lines.push(["Total gains", s.totalGains].map(cell).join(","));
  lines.push(["Total losses", s.totalLosses].map(cell).join(","));
  lines.push(["Net gain/loss", s.netGainLoss].map(cell).join(","));
  return lines.join("\n");
}
