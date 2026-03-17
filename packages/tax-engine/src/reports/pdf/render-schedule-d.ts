/**
 * Renders the Schedule D (Form 1040) page within a PDFKit document.
 *
 * @license AGPL-3.0
 */

import type { ScheduleDReport } from "../schedule-d";
import { MARGIN, CONTENT_WIDTH, fmt, renderFooter } from "./pdf-utils";

/**
 * Render a Schedule D summary page showing short-term and long-term
 * capital gains/losses with combined totals.
 *
 * @param doc - The PDFKit document instance
 * @param scheduleD - Schedule D report data
 * @param taxpayerName - Optional taxpayer name for the header
 */
export function renderScheduleDPage(
  doc: PDFKit.PDFDocument,
  scheduleD: ScheduleDReport,
  taxpayerName?: string,
): void {
  let y = MARGIN;

  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Schedule D (Form 1040)", MARGIN, y, {
      align: "center",
      width: CONTENT_WIDTH,
    });
  y += 18;

  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Capital Gains and Losses", MARGIN, y, {
      align: "center",
      width: CONTENT_WIDTH,
    });
  y += 14;

  doc
    .fontSize(8)
    .font("Helvetica")
    .text(`Tax Year ${scheduleD.taxYear}`, MARGIN, y, {
      align: "center",
      width: CONTENT_WIDTH,
    });
  y += 10;

  if (taxpayerName) {
    doc.fontSize(9).text(`Name: ${taxpayerName}`, MARGIN, y);
    y += 14;
  }
  y += 6;

  const renderPart = (
    title: string,
    lines: ScheduleDReport["partI"],
    netLabel: string,
    netValue: number,
  ) => {
    doc.fontSize(11).font("Helvetica-Bold").text(title, MARGIN, y);
    y += 16;

    // Header row
    const lineCol = MARGIN;
    const descCol = MARGIN + 40;
    const proceedsCol = MARGIN + 280;
    const basisCol = MARGIN + 355;
    const glCol = MARGIN + CONTENT_WIDTH - 70;
    const colW = 70;

    doc.fontSize(8).font("Helvetica-Bold");
    doc.text("Line", lineCol, y, { width: 35 });
    doc.text("Description", descCol, y, { width: 230 });
    doc.text("Proceeds", proceedsCol, y, { width: colW, align: "right" });
    doc.text("Cost Basis", basisCol, y, { width: colW, align: "right" });
    doc.text("Gain/Loss", glCol, y, { width: colW, align: "right" });
    y += 12;
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + CONTENT_WIDTH, y)
      .lineWidth(0.5)
      .stroke();
    y += 4;

    doc.fontSize(8).font("Helvetica");
    for (const line of lines) {
      doc.text(line.lineNumber, lineCol, y, { width: 35 });
      doc.text(line.description, descCol, y, { width: 230 });
      doc.text(line.proceeds ? fmt(line.proceeds) : "—", proceedsCol, y, {
        width: colW,
        align: "right",
      });
      doc.text(line.costBasis ? fmt(line.costBasis) : "—", basisCol, y, {
        width: colW,
        align: "right",
      });
      doc.text(line.gainLoss ? fmt(line.gainLoss) : "—", glCol, y, {
        width: colW,
        align: "right",
      });
      y += 14;
    }

    // Net total
    y += 2;
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + CONTENT_WIDTH, y)
      .lineWidth(0.5)
      .stroke();
    y += 6;
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(netLabel, descCol, y, { width: 230 });
    doc.text(fmt(netValue), glCol, y, { width: colW, align: "right" });
    y += 20;
  };

  renderPart(
    "Part I — Short-Term Capital Gains and Losses",
    scheduleD.partI,
    "Net Short-Term (Line 7)",
    scheduleD.netShortTerm,
  );
  renderPart(
    "Part II — Long-Term Capital Gains and Losses",
    scheduleD.partII,
    "Net Long-Term (Line 15)",
    scheduleD.netLongTerm,
  );

  // Combined summary
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(1)
    .stroke();
  y += 8;

  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .text("Line 16: Combined Net Gain/Loss", MARGIN, y);
  doc.text(
    fmt(scheduleD.combinedNetGainLoss),
    MARGIN + CONTENT_WIDTH - 100,
    y,
    { width: 100, align: "right" },
  );
  y += 18;

  if (scheduleD.capitalLossDeduction > 0) {
    doc
      .fontSize(9)
      .font("Helvetica")
      .text("Line 21: Capital Loss Deduction (max $3,000)", MARGIN, y);
    doc.text(
      `(${fmt(scheduleD.capitalLossDeduction)})`,
      MARGIN + CONTENT_WIDTH - 100,
      y,
      { width: 100, align: "right" },
    );
    y += 14;

    if (scheduleD.carryoverLoss > 0) {
      doc.text("Loss Carryover to Next Year", MARGIN, y);
      doc.text(fmt(scheduleD.carryoverLoss), MARGIN + CONTENT_WIDTH - 100, y, {
        width: 100,
        align: "right",
      });
    }
  }

  // Footer
  renderFooter(doc);
}
