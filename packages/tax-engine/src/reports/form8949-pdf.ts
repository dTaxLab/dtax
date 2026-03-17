/**
 * IRS Form 8949 PDF Generator
 *
 * Generates a structured PDF report matching the layout of IRS Form 8949.
 * Each page contains up to 14 line items, with Box designation and summary totals.
 *
 * @license AGPL-3.0
 */

import PDFDocument from "pdfkit";
import type { Form8949Report, Form8949Line } from "./form8949";
import type { ScheduleDReport } from "./schedule-d";
import { MARGIN, LINES_PER_PAGE } from "./pdf/pdf-utils";
import { renderForm8949Page } from "./pdf/render-form8949";
import { renderScheduleDPage } from "./pdf/render-schedule-d";

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
