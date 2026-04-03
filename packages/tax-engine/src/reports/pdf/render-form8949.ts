/**
 * Renders Form 8949 content into a PDFKit document using a flow-based layout.
 * Individual render functions take a `y` coordinate and return the updated `y`
 * after drawing, allowing the caller to pack multiple boxes onto one page.
 *
 * @license AGPL-3.0
 */

import type { Form8949Line, Form8949BoxSummary } from "../form8949";
import {
  MARGIN,
  CONTENT_WIDTH,
  BOX_DESCRIPTIONS,
  fmt,
  renderFooter,
} from "./pdf-utils";

/** Column layout shared across all row types. */
const COLS = [
  { label: "(a) Description", x: MARGIN, w: 120 },
  { label: "(b) Acquired", x: MARGIN + 122, w: 72 },
  { label: "(c) Sold", x: MARGIN + 196, w: 72 },
  { label: "(d) Proceeds", x: MARGIN + 270, w: 75 },
  { label: "(e) Cost Basis", x: MARGIN + 347, w: 75 },
  { label: "(f)", x: MARGIN + CONTENT_WIDTH - 75 - 50 - 28, w: 26 },
  { label: "(g) Adj.", x: MARGIN + CONTENT_WIDTH - 75 - 50, w: 48 },
  { label: "(h) Gain/Loss", x: MARGIN + CONTENT_WIDTH - 75, w: 75 },
] as const;

/**
 * Render the global page header (Form 8949 title, subtitle, tax year).
 * Called at the top of every page.
 *
 * @returns Updated y position after drawing.
 */
export function renderGlobalHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  taxYear: number,
  taxpayerName?: string,
  taxpayerSSN?: string,
): number {
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Form 8949", MARGIN, y, { align: "center", width: CONTENT_WIDTH });
  y += 18;

  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Sales and Other Dispositions of Capital Assets", MARGIN, y, {
      align: "center",
      width: CONTENT_WIDTH,
    });
  y += 14;

  doc.fontSize(8).font("Helvetica").text(`Tax Year ${taxYear}`, MARGIN, y, {
    align: "center",
    width: CONTENT_WIDTH,
  });
  y += 14;

  if (taxpayerName || taxpayerSSN) {
    doc.fontSize(9).font("Helvetica");
    if (taxpayerName) doc.text(`Name: ${taxpayerName}`, MARGIN, y);
    if (taxpayerSSN) doc.text(`SSN: ${taxpayerSSN}`, MARGIN + 300, y);
    y += 14;
  }

  return y;
}

/**
 * Render the box section header (box label + column headers + separator line).
 * Called whenever a new box section starts, or at the top of a continuation page.
 *
 * @returns Updated y position after drawing.
 */
export function renderBoxSectionHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  box: string,
  continued = false,
): number {
  const suffix = continued ? " (continued)" : "";
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(`Box ${box}: ${BOX_DESCRIPTIONS[box] || ""}${suffix}`, MARGIN, y);
  y += 14;

  // Column headers
  doc.fontSize(7).font("Helvetica-Bold");
  for (const col of COLS) {
    doc.text(col.label, col.x, y, {
      width: col.w,
      align: col.x > MARGIN + 200 ? "right" : "left",
    });
  }
  y += 12;

  // Separator line
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.5)
    .stroke();
  y += 4;

  return y;
}

/**
 * Render a single data line.
 *
 * @returns Updated y position after drawing.
 */
export function renderDataLine(
  doc: PDFKit.PDFDocument,
  y: number,
  line: Form8949Line,
): number {
  doc.fontSize(8).font("Helvetica");
  doc.text(line.description, COLS[0].x, y, { width: COLS[0].w });
  doc.text(line.dateAcquired, COLS[1].x, y, { width: COLS[1].w });
  doc.text(line.dateSold, COLS[2].x, y, { width: COLS[2].w });
  doc.text(fmt(line.proceeds), COLS[3].x, y, {
    width: COLS[3].w,
    align: "right",
  });
  doc.text(fmt(line.costBasis), COLS[4].x, y, {
    width: COLS[4].w,
    align: "right",
  });
  doc.text(line.adjustmentCode || "", COLS[5].x, y, {
    width: COLS[5].w,
    align: "right",
  });
  doc.text(
    line.adjustmentAmount ? fmt(line.adjustmentAmount) : "",
    COLS[6].x,
    y,
    { width: COLS[6].w, align: "right" },
  );
  doc.text(fmt(line.gainLoss), COLS[7].x, y, {
    width: COLS[7].w,
    align: "right",
  });
  return y + 14;
}

/**
 * Render the summary totals block for a box.
 *
 * @returns Updated y position after drawing.
 */
export function renderBoxSummary(
  doc: PDFKit.PDFDocument,
  y: number,
  summary: Form8949BoxSummary,
): number {
  y += 4;
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.5)
    .stroke();
  y += 6;

  doc
    .fontSize(8)
    .font("Helvetica-Bold")
    .text(
      `Totals — Box ${summary.box} (${summary.lineCount} items)`,
      COLS[0].x,
      y,
      {
        width: COLS[0].w + COLS[1].w + COLS[2].w,
      },
    );
  doc.text(fmt(summary.totalProceeds), COLS[3].x, y, {
    width: COLS[3].w,
    align: "right",
  });
  doc.text(fmt(summary.totalCostBasis), COLS[4].x, y, {
    width: COLS[4].w,
    align: "right",
  });
  doc.text(fmt(summary.totalAdjustments), COLS[6].x, y, {
    width: COLS[6].w,
    align: "right",
  });
  doc.text(fmt(summary.totalGainLoss), COLS[7].x, y, {
    width: COLS[7].w,
    align: "right",
  });

  return y + 20;
}

// ── Legacy full-page renderer (kept for backward compat) ─────────────────────

/** Options for rendering one full page of Form 8949. */
export interface PageOptions {
  box: string;
  taxYear: number;
  lines: Form8949Line[];
  summary?: Form8949BoxSummary;
  taxpayerName?: string;
  taxpayerSSN?: string;
  pageNum: number;
  totalPages: number;
}

/** @deprecated Use flow-based individual functions instead. */
export function renderForm8949Page(
  doc: PDFKit.PDFDocument,
  opts: PageOptions,
): void {
  let y = renderGlobalHeader(
    doc,
    MARGIN,
    opts.taxYear,
    opts.taxpayerName,
    opts.taxpayerSSN,
  );
  y = renderBoxSectionHeader(doc, y, opts.box);
  for (const line of opts.lines) {
    y = renderDataLine(doc, y, line);
  }
  if (opts.summary) {
    renderBoxSummary(doc, y, opts.summary);
  }
  renderFooter(doc);
}
