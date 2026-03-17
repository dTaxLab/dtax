/**
 * Renders a single Form 8949 page within a PDFKit document.
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

/** Options for rendering one page of Form 8949. */
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

/**
 * Render a single Form 8949 page with header, line items, and optional summary.
 *
 * @param doc - The PDFKit document instance
 * @param opts - Page layout and data options
 */
export function renderForm8949Page(
  doc: PDFKit.PDFDocument,
  opts: PageOptions,
): void {
  let y = MARGIN;

  // Header
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

  doc
    .fontSize(8)
    .font("Helvetica")
    .text(
      `Tax Year ${opts.taxYear}  |  Box ${opts.box}  |  Page ${opts.pageNum} of ${opts.totalPages}`,
      MARGIN,
      y,
      { align: "center", width: CONTENT_WIDTH },
    );
  y += 16;

  // Taxpayer info
  if (opts.taxpayerName || opts.taxpayerSSN) {
    doc.fontSize(9).font("Helvetica");
    if (opts.taxpayerName) doc.text(`Name: ${opts.taxpayerName}`, MARGIN, y);
    if (opts.taxpayerSSN) doc.text(`SSN: ${opts.taxpayerSSN}`, MARGIN + 300, y);
    y += 14;
  }

  // Box description
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(`Box ${opts.box}: ${BOX_DESCRIPTIONS[opts.box] || ""}`, MARGIN, y);
  y += 18;

  // Column headers
  const cols = [
    { label: "(a) Description", x: MARGIN, w: 120 },
    { label: "(b) Acquired", x: MARGIN + 122, w: 72 },
    { label: "(c) Sold", x: MARGIN + 196, w: 72 },
    { label: "(d) Proceeds", x: MARGIN + 270, w: 75 },
    { label: "(e) Cost Basis", x: MARGIN + 347, w: 75 },
    { label: "(f)", x: MARGIN + CONTENT_WIDTH - 75 - 50 - 28, w: 26 },
    { label: "(g) Adj.", x: MARGIN + CONTENT_WIDTH - 75 - 50, w: 48 },
    { label: "(h) Gain/Loss", x: MARGIN + CONTENT_WIDTH - 75, w: 75 },
  ];

  doc.fontSize(7).font("Helvetica-Bold");
  const headerY = y;
  for (const col of cols) {
    doc.text(col.label, col.x, headerY, {
      width: col.w,
      align: col.x > MARGIN + 200 ? "right" : "left",
    });
  }
  y = headerY + 12;

  // Separator
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.5)
    .stroke();
  y += 4;

  // Line items
  doc.fontSize(8).font("Helvetica");
  for (const line of opts.lines) {
    doc.text(line.description, cols[0].x, y, { width: cols[0].w });
    doc.text(line.dateAcquired, cols[1].x, y, { width: cols[1].w });
    doc.text(line.dateSold, cols[2].x, y, { width: cols[2].w });
    doc.text(fmt(line.proceeds), cols[3].x, y, {
      width: cols[3].w,
      align: "right",
    });
    doc.text(fmt(line.costBasis), cols[4].x, y, {
      width: cols[4].w,
      align: "right",
    });
    doc.text(line.adjustmentCode || "", cols[5].x, y, {
      width: cols[5].w,
      align: "right",
    });
    doc.text(
      line.adjustmentAmount ? fmt(line.adjustmentAmount) : "",
      cols[6].x,
      y,
      { width: cols[6].w, align: "right" },
    );
    doc.text(fmt(line.gainLoss), cols[7].x, y, {
      width: cols[7].w,
      align: "right",
    });
    y += 14;
  }

  // Summary totals on last page of each box
  if (opts.summary) {
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
      .text(`Totals (${opts.summary.lineCount} items)`, cols[0].x, y, {
        width: cols[0].w + cols[1].w + cols[2].w,
      });
    doc.text(fmt(opts.summary.totalProceeds), cols[3].x, y, {
      width: cols[3].w,
      align: "right",
    });
    doc.text(fmt(opts.summary.totalCostBasis), cols[4].x, y, {
      width: cols[4].w,
      align: "right",
    });
    doc.text(fmt(opts.summary.totalAdjustments), cols[6].x, y, {
      width: cols[6].w,
      align: "right",
    });
    doc.text(fmt(opts.summary.totalGainLoss), cols[7].x, y, {
      width: cols[7].w,
      align: "right",
    });
  }

  // Footer
  renderFooter(doc);
}
