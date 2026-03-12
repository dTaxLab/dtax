/**
 * Tests for TXF (Tax Exchange Format) V042 generator.
 */

import { describe, it, expect } from "vitest";
import { form8949ToTxf } from "../reports/form8949-txf";
import type { Form8949Report, Form8949Line } from "../reports/form8949";

function makeLine(overrides: Partial<Form8949Line> = {}): Form8949Line {
  return {
    description: "1.5 BTC",
    dateAcquired: "01/15/2025",
    dateSold: "06/20/2025",
    proceeds: 50000,
    costBasis: 30000,
    adjustmentCode: "",
    adjustmentAmount: 0,
    gainLoss: 20000,
    box: "C",
    holdingPeriod: "SHORT_TERM",
    eventId: "evt-1",
    ...overrides,
  };
}

function makeReport(lines: Form8949Line[], taxYear = 2025): Form8949Report {
  return {
    taxYear,
    lines,
    boxSummaries: [],
    totals: {
      shortTermGainLoss: 0,
      longTermGainLoss: 0,
      totalGainLoss: 0,
      totalProceeds: 0,
      totalCostBasis: 0,
      lineCount: lines.length,
    },
  };
}

describe("form8949ToTxf", () => {
  it("file header contains V042, program name, date, ^", () => {
    const txf = form8949ToTxf(makeReport([]));
    const lines = txf.split("\n");
    expect(lines[0]).toBe("V042");
    expect(lines[1]).toBe("ADTax Crypto Tax Calculator");
    expect(lines[2]).toMatch(/^D\d{2}\/\d{2}\/\d{4}$/);
    expect(lines[3]).toBe("^");
  });

  it("short-term Box C → refnum 712", () => {
    const txf = form8949ToTxf(makeReport([makeLine({ box: "C" })]));
    expect(txf).toContain("N712");
  });

  it("long-term Box F → refnum 714", () => {
    const txf = form8949ToTxf(
      makeReport([makeLine({ box: "F", holdingPeriod: "LONG_TERM" })]),
    );
    expect(txf).toContain("N714");
  });

  it("Box A → refnum 321", () => {
    const txf = form8949ToTxf(makeReport([makeLine({ box: "A" })]));
    expect(txf).toContain("N321");
  });

  it("Box B → refnum 711", () => {
    const txf = form8949ToTxf(makeReport([makeLine({ box: "B" })]));
    expect(txf).toContain("N711");
  });

  it("Box D → refnum 323", () => {
    const txf = form8949ToTxf(
      makeReport([makeLine({ box: "D", holdingPeriod: "LONG_TERM" })]),
    );
    expect(txf).toContain("N323");
  });

  it("Box E → refnum 713", () => {
    const txf = form8949ToTxf(
      makeReport([makeLine({ box: "E", holdingPeriod: "LONG_TERM" })]),
    );
    expect(txf).toContain("N713");
  });

  it("date format in records (MM/DD/YYYY)", () => {
    const txf = form8949ToTxf(
      makeReport([
        makeLine({ dateAcquired: "03/10/2024", dateSold: "11/25/2025" }),
      ]),
    );
    expect(txf).toContain("D03/10/2024");
    expect(txf).toContain("D11/25/2025");
  });

  it("VARIOUS dateAcquired → empty D line", () => {
    const txf = form8949ToTxf(
      makeReport([makeLine({ dateAcquired: "VARIOUS" })]),
    );
    const lines = txf.split("\n");
    // Find the record's first D line (after P line)
    const pIdx = lines.findIndex((l) => l.startsWith("P"));
    expect(pIdx).toBeGreaterThan(-1);
    // The next line should be just "D" (empty date)
    expect(lines[pIdx + 1]).toBe("D");
    // The line after should be the dateSold
    expect(lines[pIdx + 2]).toBe("D06/20/2025");
  });

  it("amount formatting (2 decimal places)", () => {
    const txf = form8949ToTxf(
      makeReport([makeLine({ costBasis: 1234.5, proceeds: 5678.1 })]),
    );
    expect(txf).toContain("$1234.50");
    expect(txf).toContain("$5678.10");
  });

  it('wash sale adjustmentCode "W" → Format 5 (3 $ lines)', () => {
    const txf = form8949ToTxf(
      makeReport([
        makeLine({
          adjustmentCode: "W",
          adjustmentAmount: 500,
          gainLoss: -1500,
        }),
      ]),
    );
    const lines = txf.split("\n");
    // Count $ lines in the record (after header)
    const dollarLines = lines.filter((l, i) => i > 3 && l.startsWith("$"));
    expect(dollarLines).toHaveLength(3);
    expect(dollarLines[2]).toBe("$500.00");
  });

  it("no wash sale → Format 4 (2 $ lines)", () => {
    const txf = form8949ToTxf(makeReport([makeLine()]));
    const lines = txf.split("\n");
    const dollarLines = lines.filter((l, i) => i > 3 && l.startsWith("$"));
    expect(dollarLines).toHaveLength(2);
  });

  it("multiple records correctly separated by ^", () => {
    const txf = form8949ToTxf(
      makeReport([
        makeLine({ eventId: "evt-1" }),
        makeLine({ eventId: "evt-2", description: "2.0 ETH" }),
      ]),
    );
    const lines = txf.split("\n");
    // Header ends with ^, then each record ends with ^
    const carets = lines.filter((l) => l === "^");
    // 1 header ^ + 2 record ^
    expect(carets).toHaveLength(3);
  });

  it("empty report → only file header", () => {
    const txf = form8949ToTxf(makeReport([]));
    const lines = txf.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("V042");
    expect(lines[3]).toBe("^");
  });

  it("record structure order: TD, N, C1, L1, P, D, D, $, $, ^", () => {
    const txf = form8949ToTxf(makeReport([makeLine()]));
    const lines = txf.split("\n");
    // Record starts after header (4 lines)
    const record = lines.slice(4);
    expect(record[0]).toBe("TD");
    expect(record[1]).toMatch(/^N\d+$/);
    expect(record[2]).toBe("C1");
    expect(record[3]).toBe("L1");
    expect(record[4]).toMatch(/^P/);
    expect(record[5]).toMatch(/^D/);
    expect(record[6]).toMatch(/^D/);
    expect(record[7]).toMatch(/^\$/);
    expect(record[8]).toMatch(/^\$/);
    expect(record[9]).toBe("^");
  });

  it("wash sale with E;W combined code uses Format 5", () => {
    const txf = form8949ToTxf(
      makeReport([
        makeLine({
          adjustmentCode: "E;W",
          adjustmentAmount: 250,
        }),
      ]),
    );
    const lines = txf.split("\n");
    const dollarLines = lines.filter((l, i) => i > 3 && l.startsWith("$"));
    expect(dollarLines).toHaveLength(3);
    expect(dollarLines[2]).toBe("$250.00");
  });

  it("negative adjustmentAmount is converted to positive via Math.abs", () => {
    const txf = form8949ToTxf(
      makeReport([
        makeLine({
          adjustmentCode: "W",
          adjustmentAmount: -300,
        }),
      ]),
    );
    expect(txf).toContain("$300.00");
    expect(txf).not.toContain("$-300.00");
  });
});
