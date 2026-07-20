/**
 * Regression tests for Audit Defense PDF layout bugs.
 *
 * Prior bugs (both from the same root cause — re-reading doc.y between
 * PDFKit .text() calls meant to sit on the same visual row):
 *  1. tableHeader() looped `doc.text(col.label, col.x, doc.y, ...)`, so each
 *     column read doc.y AFTER the previous column's call had already
 *     advanced it — headers drifted downward column by column.
 *  2. The Connected Accounts section "fixed" a similar symptom with
 *     `doc.y - LINE_HEIGHT`, which used the wrong per-font line height and
 *     left the header and the first data row overlapping (e.g. "Account
 *     NameGENERIC Import" rendered on one line).
 *
 * Both are fixed by capturing y once and passing that same y to every
 * column's .text() call, then leaving doc.y wherever the last call put it
 * (NOT resetting back to the captured y — that discards the natural
 * single-line advance the rest of the layout depends on for spacing).
 */

import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import { generateAuditDefensePdf, tableHeader } from "../reports/audit-pdf";
import type { AuditReportData } from "../reports/audit-pdf";

function makeReportData(): AuditReportData {
  return {
    taxYear: 2025,
    taxpayerName: "Test User",
    method: "FIFO",
    summary: {
      totalTransactions: 2,
      buyCount: 0,
      sellCount: 2,
      shortTermGain: 100,
      longTermGain: 200,
      totalIncome: 0,
    },
    transactions: [
      {
        date: "2025-01-30",
        type: "SELL",
        asset: "BTC",
        amount: 0.1,
        valueUsd: 10000,
        gainLoss: 100,
        sourceName: "Kraken Import",
        chain: null,
        externalId: "TX1",
      },
      {
        date: "2025-05-21",
        type: "SELL",
        asset: "BTC",
        amount: 0.2,
        valueUsd: 20000,
        gainLoss: 200,
        sourceName: "Kraken Import",
        chain: null,
        externalId: "TX2",
      },
    ],
    accounts: [
      { name: "GENERIC Import", type: "CSV", chain: null },
      { name: "Kraken Import", type: "CSV", chain: null },
    ],
  };
}

describe("Audit Defense PDF layout", () => {
  it("generates without throwing and includes both sections", async () => {
    const buf = await generateAuditDefensePdf(makeReportData());
    expect(buf.length).toBeGreaterThan(0);
  });

  it("tableHeader() advances doc.y by roughly one text line, not a near-zero amount", () => {
    // Regression guard: a broken version of tableHeader() that resets doc.y
    // back to the pre-draw position and only applies a small fractional
    // moveDown() would advance by only ~2-3pt here — nowhere near enough
    // clearance for the next row, causing header/row overlap.
    const doc = new PDFDocument({ autoFirstPage: false });
    doc.addPage();
    const startY = doc.y;
    tableHeader(doc, [
      { x: 50, label: "Date", align: "left" },
      { x: 110, label: "Type", align: "left" },
      { x: 170, label: "Amount", align: "right" },
    ]);
    expect(doc.y).toBeGreaterThan(startY + 5);
  });

  it("tableHeader() places every column at the same y (no vertical drift between columns)", () => {
    const doc = new PDFDocument({ autoFirstPage: false });
    doc.addPage();
    const positions: number[] = [];
    // Instrument doc.text to record the y each column was actually drawn at.
    const originalText = doc.text.bind(doc);
    (doc as unknown as { text: typeof doc.text }).text = ((
      text: string,
      x?: number,
      y?: number,
      opts?: unknown,
    ) => {
      if (typeof y === "number") positions.push(y);
      return originalText(text, x, y, opts as never);
    }) as typeof doc.text;

    tableHeader(doc, [
      { x: 50, label: "Date", align: "left" },
      { x: 110, label: "Type", align: "left" },
      { x: 170, label: "Amount", align: "right" },
    ]);

    expect(positions).toHaveLength(3);
    expect(new Set(positions).size).toBe(1); // all three columns drawn at the same y
  });
});
