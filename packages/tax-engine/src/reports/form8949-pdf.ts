/**
 * IRS Form 8949 PDF Generator
 *
 * Generates a structured PDF report matching the layout of IRS Form 8949.
 * Each page contains up to 14 line items, with Box designation and summary totals.
 *
 * @license AGPL-3.0
 */

import PDFDocument from "pdfkit";
import type {
  Form8949Report,
  Form8949Line,
  Form8949BoxSummary,
} from "./form8949";
import type { ScheduleDReport } from "./schedule-d";

const MARGIN = 50;
const PAGE_WIDTH = 612; // Letter
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINES_PER_PAGE = 14;

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Generate Form 8949 PDF as a Buffer.
 *
 * @param report - Form 8949 report data from generateForm8949()
 * @param options - Optional Schedule D data to append
 * @returns Promise resolving to a PDF Buffer
 */
export function generateForm8949Pdf(
  report: Form8949Report,
  options?: {
    taxpayerName?: string;
    taxpayerSSN?: string;
    scheduleD?: ScheduleDReport;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "letter", margin: MARGIN });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Group lines by box
    const linesByBox = new Map<string, Form8949Line[]>();
    for (const line of report.lines) {
      const box = line.box;
      const arr = linesByBox.get(box) || [];
      arr.push(line);
      linesByBox.set(box, arr);
    }

    let isFirstPage = true;

    for (const [box, lines] of linesByBox) {
      const summary = report.boxSummaries.find((s) => s.box === box);
      const totalPages = Math.ceil(lines.length / LINES_PER_PAGE);

      for (let page = 0; page < totalPages; page++) {
        if (!isFirstPage) doc.addPage();
        isFirstPage = false;

        const pageLines = lines.slice(
          page * LINES_PER_PAGE,
          (page + 1) * LINES_PER_PAGE,
        );
        const isLastPage = page === totalPages - 1;

        renderForm8949Page(doc, {
          box,
          taxYear: report.taxYear,
          lines: pageLines,
          summary: isLastPage ? summary : undefined,
          taxpayerName: options?.taxpayerName,
          taxpayerSSN: options?.taxpayerSSN,
          pageNum: page + 1,
          totalPages,
        });
      }
    }

    // Append Schedule D page if provided
    if (options?.scheduleD) {
      doc.addPage();
      renderScheduleDPage(doc, options.scheduleD, options.taxpayerName);
    }

    doc.end();
  });
}

interface PageOptions {
  box: string;
  taxYear: number;
  lines: Form8949Line[];
  summary?: Form8949BoxSummary;
  taxpayerName?: string;
  taxpayerSSN?: string;
  pageNum: number;
  totalPages: number;
}

function renderForm8949Page(doc: PDFKit.PDFDocument, opts: PageOptions): void {
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
  const boxDesc: Record<string, string> = {
    A: "Short-term — basis reported to IRS",
    B: "Short-term — basis NOT reported to IRS",
    C: "Short-term — not on Form 1099-B",
    D: "Long-term — basis reported to IRS",
    E: "Long-term — basis NOT reported to IRS",
    F: "Long-term — not on Form 1099-B",
  };
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(`Box ${opts.box}: ${boxDesc[opts.box] || ""}`, MARGIN, y);
  y += 18;

  // Column headers
  const cols = [
    { label: "(a) Description", x: MARGIN, w: 120 },
    { label: "(b) Acquired", x: MARGIN + 122, w: 72 },
    { label: "(c) Sold", x: MARGIN + 196, w: 72 },
    { label: "(d) Proceeds", x: MARGIN + 270, w: 75 },
    { label: "(e) Cost Basis", x: MARGIN + 347, w: 75 },
    { label: "(f) Code", x: MARGIN + 424, w: 32 },
    { label: "(g) Adjust.", x: MARGIN + 458, w: 55 },
    { label: "(h) Gain/Loss", x: MARGIN + 415, w: 97 },
  ];

  // Adjust last column to fit
  cols[7] = { label: "(h) Gain/Loss", x: MARGIN + CONTENT_WIDTH - 75, w: 75 };
  cols[6] = { label: "(g) Adj.", x: MARGIN + CONTENT_WIDTH - 75 - 50, w: 48 };
  cols[5] = { label: "(f)", x: MARGIN + CONTENT_WIDTH - 75 - 50 - 28, w: 26 };

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
  doc
    .fontSize(7)
    .font("Helvetica")
    .fillColor("#888888")
    .text(
      "Generated by DTax (dtax.dev) — For informational purposes only",
      MARGIN,
      740,
      { align: "center", width: CONTENT_WIDTH },
    );
  doc.fillColor("#000000");
}

function renderScheduleDPage(
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
  doc
    .fontSize(7)
    .font("Helvetica")
    .fillColor("#888888")
    .text(
      "Generated by DTax (dtax.dev) — For informational purposes only",
      MARGIN,
      740,
      { align: "center", width: CONTENT_WIDTH },
    );
  doc.fillColor("#000000");
}
