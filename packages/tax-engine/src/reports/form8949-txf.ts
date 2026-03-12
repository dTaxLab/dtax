/**
 * TXF (Tax Exchange Format) V042 Generator for TurboTax Import
 *
 * Converts a Form 8949 report into TXF V042 format, which can be
 * directly imported by TurboTax and other tax preparation software.
 *
 * @license AGPL-3.0
 */

import type { Form8949Report, Form8949Box } from "./form8949";

/** TXF refnum mapping: Box → IRS transaction reference number. */
const BOX_REFNUM: Record<Form8949Box, number> = {
  A: 321,
  B: 711,
  C: 712,
  D: 323,
  E: 713,
  F: 714,
};

/**
 * Format the current date as MM/DD/YYYY for the TXF file header.
 *
 * @returns Date string in MM/DD/YYYY format
 */
function formatHeaderDate(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const y = now.getFullYear();
  return `${m}/${d}/${y}`;
}

/**
 * Convert a Form 8949 report to TXF (Tax Exchange Format) V042 for TurboTax import.
 *
 * @param report - Form 8949 report data from generateForm8949()
 * @returns TXF V042 formatted string
 */
export function form8949ToTxf(report: Form8949Report): string {
  const lines: string[] = [];

  // File header
  lines.push("V042");
  lines.push("ADTax Crypto Tax Calculator");
  lines.push(`D${formatHeaderDate()}`);
  lines.push("^");

  // Per-record output
  for (const item of report.lines) {
    const refnum = BOX_REFNUM[item.box];
    const hasWashSale = item.adjustmentCode.includes("W");

    lines.push("TD");
    lines.push(`N${refnum}`);
    lines.push("C1");
    lines.push("L1");
    lines.push(`P${item.description}`);

    // Date acquired: "VARIOUS" → empty D line
    if (item.dateAcquired === "VARIOUS") {
      lines.push("D");
    } else {
      lines.push(`D${item.dateAcquired}`);
    }

    lines.push(`D${item.dateSold}`);
    lines.push(`$${item.costBasis.toFixed(2)}`);
    lines.push(`$${item.proceeds.toFixed(2)}`);

    // Wash sale: add third $ line with disallowed amount
    if (hasWashSale) {
      const washAmount = Math.abs(item.adjustmentAmount);
      lines.push(`$${washAmount.toFixed(2)}`);
    }

    lines.push("^");
  }

  return lines.join("\n");
}
