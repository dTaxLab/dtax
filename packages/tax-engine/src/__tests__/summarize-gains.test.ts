/**
 * The report summary totals must agree with Form 8949 / Schedule D to the cent.
 * Real case: 12,884 disposals, summary -288.52 vs Schedule D -289.23, because the
 * summary added unrounded results while every Form 8949 line is rounded to cents.
 */

import { describe, it, expect } from "vitest";
import { summarizeGains, roundCents } from "../math";
import { generateForm8949 } from "../reports/form8949";
import type { CalculationResult } from "../types";

function makeResults(count: number): CalculationResult[] {
  let seed = 11;
  const rnd = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, (_, i) => ({
    event: {
      id: `e${i}`,
      asset: "BTC",
      amount: 1,
      proceedsUsd: 100,
      date: new Date("2026-03-01T00:00:00Z"),
      sourceId: "s",
    },
    matchedLots: [],
    // Four decimals, positive and negative, short and long term.
    gainLoss: Math.round((rnd() - 0.5) * 2 * 1e6) / 1e4,
    holdingPeriod:
      rnd() < 0.7 ? ("SHORT_TERM" as const) : ("LONG_TERM" as const),
    method: "FIFO" as const,
  }));
}

describe("summarizeGains", () => {
  const results = makeResults(2000);
  const sums = summarizeGains(results);
  const form = generateForm8949(results, { taxYear: 2026 });

  it("net equals the Form 8949 total to the cent", () => {
    const net =
      sums.shortTermGains -
      sums.shortTermLosses +
      (sums.longTermGains - sums.longTermLosses);
    expect(roundCents(net)).toBe(form.totals.totalGainLoss);
  });

  it("short-term and long-term each equal the form", () => {
    expect(roundCents(sums.shortTermGains - sums.shortTermLosses)).toBe(
      form.totals.shortTermGainLoss,
    );
    expect(roundCents(sums.longTermGains - sums.longTermLosses)).toBe(
      form.totals.longTermGainLoss,
    );
  });

  it("negative control: adding the unrounded results does NOT match the form", () => {
    const raw = results.reduce((s, r) => s + r.gainLoss, 0);
    expect(
      Math.abs(roundCents(raw) - form.totals.totalGainLoss),
    ).toBeGreaterThanOrEqual(0.01);
  });

  it("losses are reported as positive numbers", () => {
    const s = summarizeGains([
      { gainLoss: -10.004, holdingPeriod: "SHORT_TERM" },
      { gainLoss: 5.005, holdingPeriod: "LONG_TERM" },
    ]);
    expect(s.shortTermLosses).toBe(10);
    expect(s.shortTermGains).toBe(0);
    expect(s.longTermGains).toBe(5.01);
  });
});
