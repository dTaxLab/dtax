/**
 * UK disposal schedule: rows carry the HMRC rule, apportion proceeds and fees
 * over the matches, and the totals add up.
 *
 * @license AGPL-3.0
 */
import { describe, it, expect, vi } from "vitest";
import { CostBasisCalculator } from "../calculator";
import {
  generateUkDisposalSchedule,
  ukDisposalScheduleToCsv,
} from "../reports/uk-disposal-schedule";
import type { TaxLot, TaxableEvent } from "../types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const lot = (
  id: string,
  amount: number,
  cost: number,
  day: string,
): TaxLot => ({
  id,
  asset: "BTC",
  amount,
  costBasisUsd: cost,
  acquiredAt: d(day),
  sourceId: "s",
});

function run(lots: TaxLot[], events: TaxableEvent[]) {
  const c = new CostBasisCalculator("UK_SHARE_POOLING");
  c.addLots(lots);
  c.registerEvents(events);
  const results = events.map((e) => c.calculate(e));
  const dates = new Map(lots.map((l) => [l.id, l.acquiredAt]));
  return generateUkDisposalSchedule(results, dates);
}

describe("generateUkDisposalSchedule", () => {
  it("one row per matched lot with the rule, proceeds and fee apportioned", () => {
    const sale: TaxableEvent = {
      id: "S",
      asset: "BTC",
      amount: 3,
      proceedsUsd: 300,
      feeUsd: 6,
      date: d("2025-06-01"),
      sourceId: "s",
    };
    const { rows, summary } = run(
      [lot("P", 2, 100, "2025-01-01"), lot("sd", 1, 40, "2025-06-01")],
      [sale],
    );
    expect(rows.map((r) => [r.lotId, r.rule, r.quantity])).toEqual([
      ["sd", "SAME_DAY", 1],
      ["P", "SECTION_104", 2],
    ]);
    expect(rows[0]).toMatchObject({
      proceeds: 100,
      fees: 2,
      allowableCost: 40,
      acquiredOn: "2025-06-01",
    });
    expect(rows[1]).toMatchObject({
      proceeds: 200,
      fees: 4,
      allowableCost: 100,
    });
    // sum of row gains equals the disposal gain: 300 - (40 + 100) - 6
    expect(rows.reduce((n, r) => n + r.gainLoss, 0)).toBeCloseTo(154);
    expect(summary).toMatchObject({
      numberOfDisposals: 1,
      totalProceeds: 300,
      totalAllowableCosts: 146,
      totalGains: 154,
      totalLosses: 0,
    });
  });

  it("an uncovered quantity is reported as UNMATCHED at zero cost", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rows } = run(
      [lot("P", 1, 100, "2025-01-01")],
      [
        {
          id: "S",
          asset: "BTC",
          amount: 2,
          proceedsUsd: 400,
          date: d("2025-06-01"),
          sourceId: "s",
        },
      ],
    );
    expect(rows.map((r) => r.rule)).toEqual(["SECTION_104", "UNMATCHED"]);
    expect(rows[1]).toMatchObject({
      quantity: 1,
      allowableCost: 0,
      proceeds: 200,
    });
  });

  it("losses are summed separately from gains", () => {
    const { summary } = run(
      [lot("P", 2, 1000, "2025-01-01")],
      [
        {
          id: "A",
          asset: "BTC",
          amount: 1,
          proceedsUsd: 300,
          date: d("2025-06-01"),
          sourceId: "s",
        },
        {
          id: "B",
          asset: "BTC",
          amount: 1,
          proceedsUsd: 900,
          date: d("2025-07-01"),
          sourceId: "s",
        },
      ],
    );
    expect(summary).toMatchObject({
      totalGains: 400,
      totalLosses: 200,
      netGainLoss: 200,
    });
  });

  it("CSV has the header, a row per match and the totals block", () => {
    const { rows, summary } = run(
      [lot("P", 1, 100, "2025-01-01")],
      [
        {
          id: "S",
          asset: "BTC",
          amount: 1,
          proceedsUsd: 150,
          date: d("2025-06-01"),
          sourceId: "s",
        },
      ],
    );
    const csv = ukDisposalScheduleToCsv({ rows, summary });
    expect(csv.split("\n")[0]).toContain("HMRC rule");
    expect(csv).toContain("SECTION_104");
    expect(csv).toContain("Net gain/loss,50");
  });

  it("neutralises spreadsheet formulas in imported text", () => {
    const csv = ukDisposalScheduleToCsv({
      rows: [
        {
          disposalId: "=HYPERLINK(1)",
          disposalDate: "2025-06-01",
          asset: "BTC",
          quantity: 1,
          proceeds: 1,
          allowableCost: 0,
          fees: 0,
          gainLoss: 1,
          rule: "SECTION_104",
          acquiredOn: "",
          lotId: "x",
        },
      ],
      summary: {
        numberOfDisposals: 1,
        totalProceeds: 1,
        totalAllowableCosts: 0,
        totalGains: 1,
        totalLosses: 0,
        netGainLoss: 1,
      },
    });
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});

describe("roundUkDisposalSchedule", () => {
  it("rounds amounts to pence and leaves quantity and counts alone", async () => {
    const { roundUkDisposalSchedule } =
      await import("../reports/uk-disposal-schedule");
    const out = roundUkDisposalSchedule({
      rows: [
        {
          disposalId: "S",
          disposalDate: "2025-06-01",
          asset: "BTC",
          quantity: 0.123456789,
          proceeds: 10.005,
          allowableCost: 3.3333333,
          fees: 0.004,
          gainLoss: 6.6716667,
          rule: "SECTION_104",
          acquiredOn: "",
          lotId: "x",
        },
      ],
      summary: {
        numberOfDisposals: 1,
        totalProceeds: 10.005,
        totalAllowableCosts: 3.3333,
        totalGains: 6.6716,
        totalLosses: 0,
        netGainLoss: 6.6716,
      },
    });
    expect(out.rows[0]).toMatchObject({
      quantity: 0.123456789,
      allowableCost: 3.33,
      fees: 0,
      gainLoss: 6.67,
    });
    expect(out.summary.numberOfDisposals).toBe(1);
    expect(out.summary.totalAllowableCosts).toBe(3.33);
  });

  it("rounded rows add up to the rounded totals", async () => {
    const { roundUkDisposalSchedule } =
      await import("../reports/uk-disposal-schedule");
    const row = (id: string, p: number) => ({
      disposalId: id,
      disposalDate: "2025-06-01",
      asset: "BTC",
      quantity: 1,
      proceeds: p,
      allowableCost: 0,
      fees: 0,
      gainLoss: p,
      rule: "SECTION_104" as const,
      acquiredOn: "",
      lotId: "x",
    });
    const out = roundUkDisposalSchedule({
      rows: [row("A", 10.004), row("A", 10.004), row("A", 10.004)],
      summary: {
        numberOfDisposals: 1,
        totalProceeds: 30.012,
        totalAllowableCosts: 0,
        totalGains: 30.012,
        totalLosses: 0,
        netGainLoss: 30.012,
      },
    });
    expect(out.rows.reduce((n, r) => n + r.proceeds, 0)).toBeCloseTo(
      out.summary.totalProceeds,
      10,
    );
    expect(out.summary.netGainLoss).toBe(
      out.summary.totalGains - out.summary.totalLosses,
    );
  });
});
