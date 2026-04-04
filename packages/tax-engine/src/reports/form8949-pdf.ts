/**
 * IRS Form 8949 PDF Generator
 *
 * Generates a structured PDF report matching the layout of IRS Form 8949.
 * Uses flow-based layout: multiple Box sections can share a page, lines are
 * packed to maximize space utilization and eliminate near-empty pages.
 *
 * @license AGPL-3.0
 */

import PDFDocument from "pdfkit";
import type { Form8949Report, Form8949Line } from "./form8949";
import type { ScheduleDReport } from "./schedule-d";
import {
  MARGIN,
  PAGE_BOTTOM,
  LINE_HEIGHT,
  GLOBAL_HEADER_HEIGHT,
  BOX_SECTION_HEIGHT,
  SUMMARY_HEIGHT,
} from "./pdf/pdf-utils";
import {
  renderGlobalHeader,
  renderBoxSectionHeader,
  renderDataLine,
  renderBoxSummary,
} from "./pdf/render-form8949";
import { renderScheduleDPage } from "./pdf/render-schedule-d";
import { renderFooter } from "./pdf/pdf-utils";

/**
 * Generate Form 8949 PDF as a Buffer.
 *
 * Lines from all Box sections are laid out in a continuous flow. A new page is
 * only added when the remaining vertical space is insufficient for the next
 * element, so pages fill up completely before breaking.
 *
 * @param report - Form 8949 report data from generateForm8949()
 * @param options - Optional taxpayer info and Schedule D data
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
    const doc = new PDFDocument({ size: "letter", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Group lines by box, preserving box order (A → F)
    const linesByBox = new Map<string, Form8949Line[]>();
    for (const line of report.lines) {
      const arr = linesByBox.get(line.box) || [];
      arr.push(line);
      linesByBox.set(line.box, arr);
    }

    let y = MARGIN;

    /**
     * Ensure at least `needed` vertical points remain before the next element.
     * If not, add a new page (footer is added in a post-render sweep).
     */
    function ensureSpace(needed: number): void {
      if (y + needed > PAGE_BOTTOM) {
        doc.addPage();
        y = MARGIN;
        // Re-render the global header on continuation pages
        y = renderGlobalHeader(
          doc,
          y,
          report.taxYear,
          options?.taxpayerName,
          options?.taxpayerSSN,
        );
      }
    }

    // Global header on first page
    y = renderGlobalHeader(
      doc,
      y,
      report.taxYear,
      options?.taxpayerName,
      options?.taxpayerSSN,
    );

    for (const [box, lines] of linesByBox) {
      const summary = report.boxSummaries.find((s) => s.box === box);

      // Box section header needs room for itself + at least 1 data line
      ensureSpace(BOX_SECTION_HEIGHT + LINE_HEIGHT);

      // Add visual gap between boxes (not at page top)
      if (y > MARGIN + GLOBAL_HEADER_HEIGHT + 2) y += 8;

      let isContinuation = false;
      y = renderBoxSectionHeader(doc, y, box);

      for (const line of lines) {
        // If no space for this line, start a new page with continuation header
        if (y + LINE_HEIGHT > PAGE_BOTTOM) {
          doc.addPage();
          y = MARGIN;
          y = renderGlobalHeader(
            doc,
            y,
            report.taxYear,
            options?.taxpayerName,
            options?.taxpayerSSN,
          );
          isContinuation = true;
          y = renderBoxSectionHeader(doc, y, box, isContinuation);
        }
        y = renderDataLine(doc, y, line);
      }

      // Summary totals
      if (summary) {
        ensureSpace(SUMMARY_HEIGHT);
        y = renderBoxSummary(doc, y, summary);
      }
    }

    // Append Schedule D page if provided
    if (options?.scheduleD) {
      doc.addPage();
      renderScheduleDPage(doc, options.scheduleD, options.taxpayerName);
    }

    // Add footer to every page (post-render sweep — bufferPages:true allows switchToPage)
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      renderFooter(doc);
    }

    doc.flushPages();
    doc.end();
  });
}
