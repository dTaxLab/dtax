import { describe, it } from "vitest";
import { generateForm8949Pdf } from "../reports/form8949-pdf";
import { generateForm8949 } from "../reports/form8949";
import type { CalculationResult } from "../types";
import fs from "fs";

function makeResults(count: number): { results: CalculationResult[], lotDates: Map<string, Date> } {
  const results: CalculationResult[] = [];
  const lotDates = new Map<string, Date>();
  for (let i = 0; i < count; i++) {
    const lotId = `lot${i}`;
    lotDates.set(lotId, new Date("2024-01-01"));
    results.push({
      event: { id: `e${i}`, asset: "ETH", amount: 0.1, proceedsUsd: 200, date: new Date("2025-06-15"), sourceId: "s1" },
      matchedLots: [{ lotId, amount: 0.1, costBasisUsd: 150 }],
      gainLoss: 50, holdingPeriod: "SHORT_TERM", method: "FIFO",
    });
  }
  return { results, lotDates };
}

describe("debug", () => {
  it("check page structure in PDF for 10 lines", async () => {
    const { results, lotDates } = makeResults(10);
    const report = generateForm8949(results, { taxYear: 2025, lotDates, reportingBasis: "none" });
    const pdf = await generateForm8949Pdf(report);
    fs.writeFileSync("/tmp/form8949-10.pdf", pdf);
    
    const str = pdf.toString("binary");
    // Find all /Type /Page occurrences (not /Pages)
    const pageMatches = str.match(/\/Type\s*\/Page[^s]/g);
    // Find all /Type /Pages occurrences
    const pagesMatches = str.match(/\/Type\s*\/Pages/g);
    console.log(`/Type /Page (not s): ${pageMatches?.length}`);
    console.log(`/Type /Pages: ${pagesMatches?.length}`);
    
    // Count addPage by looking for page dictionaries in PDFKit output
    // Each page stream starts with "stream\r\n" after the page dict
    const streamCount = (str.match(/\bstream\r?\n/g) || []).length;
    console.log(`Stream count: ${streamCount}`);
  });

  it("check page structure for 50 lines", async () => {
    const { results, lotDates } = makeResults(50);
    const report = generateForm8949(results, { taxYear: 2025, lotDates, reportingBasis: "none" });
    const pdf = await generateForm8949Pdf(report);
    fs.writeFileSync("/tmp/form8949-50.pdf", pdf);
    
    const str = pdf.toString("binary");
    const pageMatches = str.match(/\/Type\s*\/Page[^s]/g);
    const streamCount = (str.match(/\bstream\r?\n/g) || []).length;
    console.log(`50 lines - /Type /Page: ${pageMatches?.length}, streams: ${streamCount}`);
    
    // Check if blank pages exist by looking for empty streams
    const emptyStreams = str.match(/stream\r?\n\r?\nendstream/g);
    console.log(`Empty streams (blank pages?): ${emptyStreams?.length}`);
  });
});
