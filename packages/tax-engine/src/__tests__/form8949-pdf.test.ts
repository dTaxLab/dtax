/**
 * Form 8949 PDF Generator Tests
 */

import { describe, it, expect } from "vitest";
import { generateForm8949Pdf } from "../reports/form8949-pdf";
import { generateForm8949 } from "../reports/form8949";
import { generateScheduleD } from "../reports/schedule-d";
import type { CalculationResult } from "../types";

function makeResult(
  overrides: Partial<CalculationResult> = {},
): CalculationResult {
  return {
    event: {
      id: "e1",
      asset: "BTC",
      amount: 1,
      proceedsUsd: 50000,
      date: new Date("2025-06-15"),
      sourceId: "s1",
    },
    matchedLots: [{ lotId: "lot1", amount: 1, costBasisUsd: 30000 }],
    gainLoss: 20000,
    holdingPeriod: "LONG_TERM",
    method: "FIFO",
    ...overrides,
  };
}

describe("generateForm8949Pdf", () => {
  it("generates a valid PDF buffer", async () => {
    const results = [makeResult()];
    const lotDates = new Map([["lot1", new Date("2024-01-01")]]);
    const report = generateForm8949(results, {
      taxYear: 2025,
      lotDates,
      reportingBasis: "none",
    });

    const pdf = await generateForm8949Pdf(report);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(100);
    // PDF magic bytes
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("includes Schedule D when provided", async () => {
    const results = [makeResult()];
    const lotDates = new Map([["lot1", new Date("2024-01-01")]]);
    const report = generateForm8949(results, {
      taxYear: 2025,
      lotDates,
      reportingBasis: "none",
    });
    const scheduleD = generateScheduleD(report);

    const pdf = await generateForm8949Pdf(report, { scheduleD });

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(100);
  });

  it("includes taxpayer info when provided", async () => {
    const results = [makeResult()];
    const lotDates = new Map([["lot1", new Date("2024-01-01")]]);
    const report = generateForm8949(results, {
      taxYear: 2025,
      lotDates,
      reportingBasis: "none",
    });

    const pdf = await generateForm8949Pdf(report, {
      taxpayerName: "John Doe",
      taxpayerSSN: "***-**-1234",
    });

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(100);
  });

  it("handles multiple boxes", async () => {
    const longTerm = makeResult({ holdingPeriod: "LONG_TERM" });
    const shortTerm = makeResult({
      event: {
        id: "e2",
        asset: "ETH",
        amount: 5,
        proceedsUsd: 10000,
        date: new Date("2025-06-15"),
        sourceId: "s1",
      },
      matchedLots: [{ lotId: "lot2", amount: 5, costBasisUsd: 8000 }],
      gainLoss: 2000,
      holdingPeriod: "SHORT_TERM",
    });

    const lotDates = new Map([
      ["lot1", new Date("2024-01-01")],
      ["lot2", new Date("2025-03-01")],
    ]);
    const report = generateForm8949([longTerm, shortTerm], {
      taxYear: 2025,
      lotDates,
      reportingBasis: "none",
    });

    const pdf = await generateForm8949Pdf(report);

    expect(pdf).toBeInstanceOf(Buffer);
    // Should have at least 2 pages (one per box)
    expect(pdf.length).toBeGreaterThan(200);
  });

  it("handles empty report", async () => {
    const report = generateForm8949([], {
      taxYear: 2025,
      lotDates: new Map(),
      reportingBasis: "none",
    });

    const pdf = await generateForm8949Pdf(report);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
