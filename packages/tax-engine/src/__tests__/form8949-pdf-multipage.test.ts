import { describe, it, expect } from "vitest";
import { generateForm8949Pdf } from "../reports/form8949-pdf";
import { generateForm8949 } from "../reports/form8949";
import type { CalculationResult } from "../types";

function makeResults(count: number, holdingPeriod: "SHORT_TERM" | "LONG_TERM" = "SHORT_TERM"): { results: CalculationResult[], lotDates: Map<string, Date> } {
  const results: CalculationResult[] = [];
  const lotDates = new Map<string, Date>();
  for (let i = 0; i < count; i++) {
    const lotId = `lot${i}`;
    lotDates.set(lotId, new Date("2024-01-01"));
    results.push({
      event: {
        id: `e${i}`,
        asset: "ETH",
        amount: 0.1 + i * 0.01,
        proceedsUsd: 200 + i * 5,
        date: new Date("2025-06-15"),
        sourceId: "s1",
      },
      matchedLots: [{ lotId, amount: 0.1 + i * 0.01, costBasisUsd: 150 + i * 3 }],
      gainLoss: 50 + i * 2,
      holdingPeriod,
      method: "FIFO",
    });
  }
  return { results, lotDates };
}

function countPdfPages(pdf: Buffer): number {
  const str = pdf.toString("binary");
  const m = str.match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}

describe("Form 8949 PDF multi-page layout", () => {
  it("100 lines produce ~3 pages (not 100+)", async () => {
    const { results, lotDates } = makeResults(100);
    const report = generateForm8949(results, { taxYear: 2025, lotDates, reportingBasis: "none" });
    const pdf = await generateForm8949Pdf(report, { taxpayerName: "John Doe" });
    const pages = countPdfPages(pdf);
    console.log(`100 lines → ${pages} pages`);
    // 100 lines / ~41 lines per continuation page = ~3 pages (form8949 + maybe schedule D)
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(pages).toBeLessThanOrEqual(5);
  });

  it("50 lines produce ~2 pages", async () => {
    const { results, lotDates } = makeResults(50);
    const report = generateForm8949(results, { taxYear: 2025, lotDates, reportingBasis: "none" });
    const pdf = await generateForm8949Pdf(report);
    const pages = countPdfPages(pdf);
    console.log(`50 lines → ${pages} pages`);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(3);
  });
});
