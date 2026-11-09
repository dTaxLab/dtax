/**
 * Reading files and calculating, as pure functions of the file contents.
 *
 * The calculation is the engine's, run the way the dTax command line runs it:
 * every disposal is calculated in time order (earlier years use up lots) and
 * only the asked tax year is reported.
 *
 * @license AGPL-3.0
 */

import {
  CostBasisCalculator,
  parsedToEvent,
  parsedToLot,
  parseCsv,
  summarizeGains,
} from "@dtax/tax-engine";
import type {
  CalculationResult,
  CsvFormat,
  ParsedTransaction,
  TaxLot,
  TaxableEvent,
} from "@dtax/tax-engine";
import { readCsv } from "./safe-files";
import { safeAsset, money, day, UNKNOWN_ASSET } from "./sanitize";
import type { Method } from "./constants";

export interface Loaded {
  transactions: ParsedTransaction[];
  files: { format: string; rows: number; parsed: number; failed: number }[];
  /** Row numbers of rows that could not be read (the messages are not kept: they can quote the file). */
  failedRows: number[];
  failedCount: number;
}

const TRANSFER_TYPES = new Set(["TRANSFER_IN", "TRANSFER_OUT"]);
const ACQUISITION_NEEDS_VALUE = new Set([
  "BUY",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "GIFT_RECEIVED",
  "TRANSFER_IN",
]);
const DISPOSAL_NEEDS_VALUE = new Set(["SELL", "GIFT_SENT", "TRANSFER_OUT"]);

export function loadFiles(
  paths: string[],
  roots: string[],
  format?: CsvFormat,
): Loaded {
  const transactions: ParsedTransaction[] = [];
  const files: Loaded["files"] = [];
  const failedRows: number[] = [];
  let failedCount = 0;
  for (const p of paths) {
    const content = readCsv(p, roots);
    const result = parseCsv(content, format ? { format } : undefined);
    transactions.push(...result.transactions);
    files.push({
      format: String(result.summary.format),
      rows: result.summary.totalRows,
      parsed: result.summary.parsed,
      failed: result.summary.failed,
    });
    failedCount += result.errors.length;
    for (const e of result.errors) {
      if (failedRows.length < 10 && Number.isFinite(e.row))
        failedRows.push(e.row);
    }
  }
  // time order across files, so lots are used in the right order
  if (paths.length > 1) {
    transactions.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }
  return { transactions, files, failedRows, failedCount };
}

export interface InputSummary {
  files: number;
  rows_read: number;
  rows_parsed: number;
  rows_failed: number;
  failed_row_numbers: number[];
  detected_formats: string[];
  date_range: { from: string | null; to: string | null };
  rows_by_type: Record<string, number>;
  assets: { count: number; top: string[] };
}

export function summarizeInput(l: Loaded): InputSummary {
  const byType: Record<string, number> = {};
  const assets = new Map<string, number>();
  let from: number | null = null;
  let to: number | null = null;
  for (const t of l.transactions) {
    byType[t.type] = (byType[t.type] ?? 0) + 1;
    const ts = new Date(t.timestamp).getTime();
    if (Number.isFinite(ts)) {
      from = from === null ? ts : Math.min(from, ts);
      to = to === null ? ts : Math.max(to, ts);
    }
    for (const a of [t.receivedAsset, t.sentAsset]) {
      if (a) assets.set(safeAsset(a), (assets.get(safeAsset(a)) ?? 0) + 1);
    }
  }
  const top = [...assets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([a]) => a);
  return {
    files: l.files.length,
    rows_read: l.files.reduce((n, f) => n + f.rows, 0),
    rows_parsed: l.transactions.length,
    rows_failed: l.failedCount,
    failed_row_numbers: l.failedRows,
    detected_formats: [...new Set(l.files.map((f) => f.format))],
    date_range: {
      from: from === null ? null : day(new Date(from)),
      to: to === null ? null : day(new Date(to)),
    },
    rows_by_type: byType,
    assets: { count: assets.size, top },
  };
}

export interface Completeness {
  is_complete: boolean;
  rows_failed_to_read: number;
  acquisitions_without_usd_value: number;
  disposals_without_usd_value: number;
  disposals_with_missing_cost_basis: number;
  transfer_rows_unpaired: number;
  rows_of_unrecognised_type: number;
}

export interface ReviewFlag {
  code: string;
  rows: number;
  note: string;
}

const FLAG_NOTES: Record<string, string> = {
  AIRDROP:
    "Rows of type airdrop are in the file. Their treatment may need confirmation by a tax professional.",
  STAKING_REWARD:
    "Staking rewards are in the file. Their treatment may need confirmation by a tax professional.",
  MINING_REWARD:
    "Mining rewards are in the file. Their treatment may need confirmation by a tax professional.",
  INTEREST:
    "Interest income rows are in the file. Their treatment may need confirmation by a tax professional.",
  GIFT_RECEIVED:
    "Gift received rows are in the file. Their treatment may need confirmation by a tax professional.",
  GIFT_SENT:
    "Gift sent rows are in the file. Their treatment may need confirmation by a tax professional.",
  TRANSFER_IN:
    "Transfers in are in the file and are not paired with transfers out.",
  TRANSFER_OUT:
    "Transfers out are in the file and are not paired with transfers in.",
  UNKNOWN:
    "Rows of a type the parser could not recognise are in the file; they are not part of the figures.",
};

export interface Calculation {
  results: CalculationResult[];
  lots: TaxLot[];
  events: TaxableEvent[];
  lotById: Map<string, TaxLot>;
  completeness: Completeness;
  reviewFlags: ReviewFlag[];
  totals: {
    short_term_gains: number;
    short_term_losses: number;
    long_term_gains: number;
    long_term_losses: number;
    estimated_net_gain_loss: number;
    disposals: number;
  };
}

export function calculate(
  l: Loaded,
  options: { method: Method; taxYear: number },
): Calculation {
  const lots: TaxLot[] = [];
  const events: TaxableEvent[] = [];
  let acquisitionsNoValue = 0;
  let disposalsNoValue = 0;
  let transferRows = 0;
  let unrecognised = 0;
  const flagRows = new Map<string, number>();

  l.transactions.forEach((tx, i) => {
    const lot = parsedToLot(tx, i);
    if (lot) lots.push(lot);
    const event = parsedToEvent(tx, i);
    if (event) events.push(event);
    if (TRANSFER_TYPES.has(tx.type)) transferRows++;
    if (tx.type === "UNKNOWN") unrecognised++;
    if (
      ACQUISITION_NEEDS_VALUE.has(tx.type) &&
      lot &&
      tx.receivedValueUsd == null
    )
      acquisitionsNoValue++;
    if (tx.type === "TRADE" && lot && tx.receivedValueUsd == null)
      acquisitionsNoValue++;
    if (DISPOSAL_NEEDS_VALUE.has(tx.type) && event && tx.sentValueUsd == null)
      disposalsNoValue++;
    if (tx.type === "TRADE" && event && tx.sentValueUsd == null)
      disposalsNoValue++;
    if (FLAG_NOTES[tx.type])
      flagRows.set(tx.type, (flagRows.get(tx.type) ?? 0) + 1);
  });

  const calculator = new CostBasisCalculator(options.method);
  calculator.addLots(lots);
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  calculator.registerEvents(events);
  const results: CalculationResult[] = [];
  for (const event of events) {
    const r = calculator.calculate(event);
    if (event.date.getUTCFullYear() !== options.taxYear) continue;
    results.push(r);
  }
  const s = summarizeGains(results);
  const missingBasis = results.filter(
    (r) => (r.unmatchedAmount ?? 0) > 0,
  ).length;

  const completeness: Completeness = {
    rows_failed_to_read: l.failedCount,
    acquisitions_without_usd_value: acquisitionsNoValue,
    disposals_without_usd_value: disposalsNoValue,
    disposals_with_missing_cost_basis: missingBasis,
    transfer_rows_unpaired: transferRows,
    rows_of_unrecognised_type: unrecognised,
    is_complete: false,
  };
  completeness.is_complete =
    l.failedCount === 0 &&
    acquisitionsNoValue === 0 &&
    disposalsNoValue === 0 &&
    missingBasis === 0 &&
    transferRows === 0 &&
    unrecognised === 0;

  const reviewFlags: ReviewFlag[] = [...flagRows.entries()].map(
    ([code, rows]) => ({
      code,
      rows,
      note: FLAG_NOTES[code],
    }),
  );

  return {
    results,
    lots,
    events,
    lotById: new Map(lots.map((x) => [x.id, x])),
    completeness,
    reviewFlags,
    totals: {
      short_term_gains: money(s.shortTermGains) ?? 0,
      short_term_losses: money(s.shortTermLosses) ?? 0,
      long_term_gains: money(s.longTermGains) ?? 0,
      long_term_losses: money(s.longTermLosses) ?? 0,
      estimated_net_gain_loss:
        money(
          s.shortTermGains -
            s.shortTermLosses +
            (s.longTermGains - s.longTermLosses),
        ) ?? 0,
      disposals: results.length,
    },
  };
}

export function describeDisposal(
  r: CalculationResult,
  lotById: Map<string, TaxLot>,
) {
  const proceeds = money(r.event.proceedsUsd);
  return {
    disposal_id: r.event.id,
    asset:
      safeAsset(r.event.asset) === UNKNOWN_ASSET
        ? UNKNOWN_ASSET
        : r.event.asset,
    date: day(r.event.date),
    proceeds_usd: proceeds,
    estimated_gain_loss_usd: money(r.gainLoss),
    holding_period:
      r.holdingPeriod === "LONG_TERM" ? "long_term" : "short_term",
    cost_basis_missing_for_units: r.unmatchedAmount ?? 0,
    matched_lots: r.matchedLots.map((m) => {
      const lot = lotById.get(m.lotId);
      const acquired = lot ? lot.acquiredAt : null;
      const held =
        acquired === null
          ? null
          : Math.floor(
              (r.event.date.getTime() - acquired.getTime()) / 86_400_000,
            );
      return {
        lot_id: m.lotId,
        acquired_on: acquired ? day(acquired) : null,
        units_used: m.amountConsumed,
        cost_basis_usd: money(m.costBasisUsd),
        days_held: held,
      };
    }),
  };
}
