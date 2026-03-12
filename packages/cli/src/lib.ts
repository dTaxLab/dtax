/**
 * CLI library functions.
 * Extracted for testability — pure functions with no side effects.
 *
 * @license AGPL-3.0
 */

import type {
  TaxLot,
  TaxableEvent,
  ParsedTransaction,
  ComparisonResult,
} from "@dtax/tax-engine";

/** Parse CLI arguments into command, files, and flags */
export function parseArgs(args: string[]): {
  command: string;
  file?: string;
  files: string[];
  flags: Record<string, string>;
} {
  const flags: Record<string, string> = {};
  let command = "";
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else if (!command) {
      command = arg;
    } else {
      files.push(arg);
    }
  }

  return { command, file: files[0], files, flags };
}

/** Map a ParsedTransaction to a TaxLot if it's an acquisition */
export function toTaxLot(tx: ParsedTransaction, index: number): TaxLot | null {
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

/** Map a ParsedTransaction to a TaxableEvent if it's a disposition */
export function toTaxableEvent(
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
  if (yearFilter && eventDate.getFullYear() !== yearFilter) return null;

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

/**
 * Format a ComparisonResult as a human-readable table for terminal output.
 *
 * @param comparison - The result from compareAllMethods
 * @param currency - Currency code for formatting (default: "USD")
 * @param rate - Exchange rate vs USD (default: 1)
 * @returns Array of lines to print
 */
export function formatComparisonTable(
  comparison: ComparisonResult,
  currency: string = "USD",
  rate: number = 1,
): string[] {
  const fmt = (n: number): string => {
    const converted = n * rate;
    try {
      return converted.toLocaleString("en-US", {
        style: "currency",
        currency,
      });
    } catch {
      return `${currency} ${converted.toFixed(2)}`;
    }
  };

  const methods = [
    { name: "FIFO", r: comparison.fifo },
    { name: "LIFO", r: comparison.lifo },
    { name: "HIFO", r: comparison.hifo },
  ] as const;

  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(60));
  lines.push("          Method Comparison (What-If Analysis)");
  lines.push("=".repeat(60));
  lines.push("");

  // Header
  lines.push(
    `  ${"Method".padEnd(10)} ${"Gain/Loss".padEnd(16)} ${"Period".padEnd(12)} ${"Wash Risk"}`,
  );
  lines.push("  " + "-".repeat(54));

  for (const m of methods) {
    const rec = m.name === comparison.recommended ? " *" : "";
    const gl = fmt(m.r.projectedGainLoss);
    const period = m.r.holdingPeriod.replace("_", " ");
    const wash = m.r.washSaleRisk ? "YES" : "no";
    lines.push(
      `  ${(m.name + rec).padEnd(10)} ${gl.padEnd(16)} ${period.padEnd(12)} ${wash}`,
    );
  }

  lines.push("");
  lines.push("-".repeat(60));
  lines.push(`  Recommended:  ${comparison.recommended}`);
  lines.push(`  Reason:       ${comparison.recommendedReason}`);
  lines.push(`  Savings:      ${fmt(comparison.savings)}`);
  lines.push("=".repeat(60));

  return lines;
}

/**
 * Format a ComparisonResult as a plain object for JSON output.
 *
 * @param comparison - The result from compareAllMethods
 * @param rate - Exchange rate vs USD (default: 1)
 * @returns Object suitable for JSON serialization
 */
export function formatComparisonJson(
  comparison: ComparisonResult,
  rate: number = 1,
): Record<string, unknown> {
  const convert = (r: ComparisonResult["fifo"]) => ({
    projectedGainLoss: r.projectedGainLoss * rate,
    holdingPeriod: r.holdingPeriod,
    shortTermGainLoss: r.shortTermGainLoss * rate,
    longTermGainLoss: r.longTermGainLoss * rate,
    washSaleRisk: r.washSaleRisk,
    washSaleDisallowed: r.washSaleDisallowed * rate,
  });

  return {
    fifo: convert(comparison.fifo),
    lifo: convert(comparison.lifo),
    hifo: convert(comparison.hifo),
    recommended: comparison.recommended,
    recommendedReason: comparison.recommendedReason,
    savings: comparison.savings * rate,
  };
}
