/**
 * CLI library functions.
 * Extracted for testability — pure functions with no side effects.
 *
 * @license AGPL-3.0
 */

import type { ComparisonResult } from "@dtax/tax-engine";

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

/** The mapping from parsed rows to lots and events lives in the engine (shared with the MCP server). */
export {
  parsedToLot as toTaxLot,
  parsedToEvent as toTaxableEvent,
} from "@dtax/tax-engine";

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

  const DISPLAY_METHODS = ["FIFO", "LIFO", "HIFO"] as const;
  const methodRows = DISPLAY_METHODS.map((name) => ({
    name,
    r: comparison.methods[name],
  }));

  const reasonLabels: Record<string, string> = {
    identical: "All methods produce identical results",
    lowest_gain: "Lowest taxable gain",
    largest_loss_clean: "Largest loss, no wash sale risk",
    largest_loss: "Largest deductible loss",
  };

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

  for (const m of methodRows) {
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
  lines.push(
    `  Reason:       ${reasonLabels[comparison.recommendedReasonCode] ?? comparison.recommendedReasonCode}`,
  );
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
  const convert = (
    r: (typeof comparison.methods)[keyof typeof comparison.methods],
  ) => ({
    projectedGainLoss: r.projectedGainLoss * rate,
    holdingPeriod: r.holdingPeriod,
    shortTermGainLoss: r.shortTermGainLoss * rate,
    longTermGainLoss: r.longTermGainLoss * rate,
    washSaleRisk: r.washSaleRisk,
    washSaleDisallowed: r.washSaleDisallowed * rate,
  });

  return {
    fifo: convert(comparison.methods["FIFO"]),
    lifo: convert(comparison.methods["LIFO"]),
    hifo: convert(comparison.methods["HIFO"]),
    recommended: comparison.recommended,
    recommendedReasonCode: comparison.recommendedReasonCode,
    savings: comparison.savings * rate,
  };
}
