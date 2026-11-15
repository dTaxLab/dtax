/**
 * A sale that takes units from lots on both sides of the one-year line reports
 * as a short-term part and a long-term part, not as one period decided by the
 * earliest lot.
 */
import { describe, it, expect } from "vitest";
import { calculateFIFO } from "../methods/fifo";
import { calculateSpecificId } from "../methods/specific-id";
import { calculateGermanyFIFO } from "../methods/germany-fifo";
import { getHoldingPeriod, longTermStartDate } from "../methods/shared";
import { analyzeHoldings } from "../portfolio/holdings";
import { CostBasisCalculator } from "../calculator";
import { calculateLIFO } from "../methods/lifo";
import { calculateHIFO } from "../methods/hifo";
import { generateForm8949 } from "../reports/form8949";
import { generateScheduleD } from "../reports/schedule-d";
import { computeWashSaleCarryover, detectWashSales } from "../wash-sale";
import { summarizeGains, termLegs } from "../term-legs";
import type { TaxLot, TaxableEvent } from "../types";

const sold = new Date("2026-03-24T10:00:00Z");
const lots = (): TaxLot[] => [
  {
    id: "old",
    asset: "SOL",
    amount: 2,
    costBasisUsd: 100,
    acquiredAt: new Date("2025-01-10T10:00:00Z"), // long term at the sale
    sourceId: "cb",
  },
  {
    id: "new",
    asset: "SOL",
    amount: 1,
    costBasisUsd: 60,
    acquiredAt: new Date("2025-10-10T10:00:00Z"), // short term at the sale
    sourceId: "cb",
  },
];
const event = (over: Partial<TaxableEvent> = {}): TaxableEvent => ({
  id: "s1",
  asset: "SOL",
  amount: 2.5,
  proceedsUsd: 500,
  feeUsd: 5,
  date: sold,
  sourceId: "cb",
  ...over,
});

describe("a sale across the one-year line", () => {
  it("records each lot's own holding period and calls the sale MIXED", () => {
    const r = calculateFIFO(lots(), event(), true);
    expect(r.matchedLots.map((m) => m.holdingPeriod)).toEqual([
      "LONG_TERM",
      "SHORT_TERM",
    ]);
    expect(r.holdingPeriod).toBe("MIXED");
  });

  it("splits into a short and a long part that add up to the sale", () => {
    const r = calculateFIFO(lots(), event(), true);
    const [st, lt] = termLegs(r);
    expect(st.holdingPeriod).toBe("SHORT_TERM");
    expect(lt.holdingPeriod).toBe("LONG_TERM");
    expect(st.amount + lt.amount).toBeCloseTo(2.5, 9);
    expect(lt.amount).toBe(2);
    expect(st.proceedsUsd + lt.proceedsUsd).toBeCloseTo(500, 9);
    expect(st.feeUsd + lt.feeUsd).toBeCloseTo(5, 9);
    expect(st.gainLoss + lt.gainLoss).toBeCloseTo(r.gainLoss, 9);
    // 2 of 2.5 units are long term: 80% of proceeds and fee
    expect(lt.proceedsUsd).toBeCloseTo(400, 9);
    expect(lt.costBasisUsd).toBeCloseTo(100, 9);
    expect(st.costBasisUsd).toBeCloseTo(30, 9); // half of the 60 lot
  });

  it("positive control: the earliest lot alone would have made the whole sale long term", () => {
    // the earliest lot (Jan 2025) is long term at the sale; deciding by it alone
    // (the old behaviour) calls the whole 2.5 units long term
    const r = calculateFIFO(lots(), event(), true);
    expect(r.matchedLots[0].holdingPeriod).toBe("LONG_TERM");
    expect(r.holdingPeriod).not.toBe("LONG_TERM");
    expect(termLegs(r)[0].amount).toBeCloseTo(0.5, 9);
  });

  it("Form 8949 has one line per part, in the right boxes, with unique ids", () => {
    const r = calculateFIFO(lots(), event(), true);
    const form = generateForm8949([r], { taxYear: 2026 });
    expect(form.lines).toHaveLength(2);
    const byTerm = Object.fromEntries(
      form.lines.map((l) => [l.holdingPeriod, l]),
    );
    expect(byTerm.SHORT_TERM.box).toBe("C");
    expect(byTerm.LONG_TERM.box).toBe("F");
    expect(byTerm.LONG_TERM.description).toBe("2 SOL");
    expect(new Set(form.lines.map((l) => l.eventId)).size).toBe(2);
    expect(form.totals.totalGainLoss).toBeCloseTo(r.gainLoss, 2);
    expect(
      form.totals.shortTermGainLoss + form.totals.longTermGainLoss,
    ).toBeCloseTo(r.gainLoss, 2);
  });

  it("the summary, Form 8949 and Schedule D agree to the cent", () => {
    const r = calculateFIFO(lots(), event(), true);
    const sums = summarizeGains([r]);
    const form = generateForm8949([r], { taxYear: 2026 });
    const sd = generateScheduleD(form);
    expect(sums.shortTermGains - sums.shortTermLosses).toBeCloseTo(
      form.totals.shortTermGainLoss,
      2,
    );
    expect(sums.longTermGains - sums.longTermLosses).toBeCloseTo(
      form.totals.longTermGainLoss,
      2,
    );
    expect(sd.netShortTerm).toBeCloseTo(form.totals.shortTermGainLoss, 2);
    expect(sd.netLongTerm).toBeCloseTo(form.totals.longTermGainLoss, 2);
  });

  it("a sale on one side of the line is unchanged: one line, same id", () => {
    const r = calculateFIFO(
      lots(),
      event({ amount: 1.5, proceedsUsd: 300 }),
      true,
    );
    expect(r.holdingPeriod).toBe("LONG_TERM");
    const form = generateForm8949([r], { taxYear: 2026 });
    expect(form.lines).toHaveLength(1);
    expect(form.lines[0].eventId).toBe("s1");
  });

  it("units with no lot are short term, so a sale of long lots plus a gap is mixed", () => {
    const r = calculateFIFO(
      [{ ...lots()[0] }],
      event({ amount: 3, proceedsUsd: 600, feeUsd: 0 }),
      true,
    );
    expect(r.unmatchedAmount).toBe(1);
    expect(r.holdingPeriod).toBe("MIXED");
    const [st, lt] = termLegs(r);
    expect(st.amount).toBe(1);
    expect(st.costBasisUsd).toBe(0);
    expect(lt.amount).toBe(2);
  });

  it("works the same for LIFO and HIFO", () => {
    for (const calc of [calculateLIFO, calculateHIFO]) {
      const r = calc(lots(), event(), true);
      const legs = termLegs(r);
      expect(legs.map((l) => l.holdingPeriod)).toEqual([
        "SHORT_TERM",
        "LONG_TERM",
      ]);
      expect(legs.reduce((s, l) => s + l.gainLoss, 0)).toBeCloseTo(
        r.gainLoss,
        9,
      );
    }
  });

  it("a wash-sale loss is disallowed on the part that lost, not the part that gained", () => {
    // long part gains, short part loses; sale total is a loss
    const l: TaxLot[] = [
      {
        id: "old",
        asset: "SOL",
        amount: 1,
        costBasisUsd: 10,
        acquiredAt: new Date("2025-01-10T10:00:00Z"),
        sourceId: "cb",
      },
      {
        id: "new",
        asset: "SOL",
        amount: 1,
        costBasisUsd: 400,
        acquiredAt: new Date("2025-10-10T10:00:00Z"),
        sourceId: "cb",
      },
    ];
    const r = calculateFIFO(
      l,
      event({ amount: 2, proceedsUsd: 200, feeUsd: 0 }),
      true,
    );
    const [st, lt] = termLegs(r);
    expect(lt.gainLoss).toBeGreaterThan(0);
    expect(st.gainLoss).toBeLessThan(0);
    const wash = detectWashSales(
      [r],
      [
        {
          lotId: "rebuy",
          asset: "SOL",
          amount: 2,
          acquiredAt: new Date("2026-03-30T10:00:00Z"),
        },
      ],
      new Set(),
    );
    const form = generateForm8949([r], {
      taxYear: 2026,
      washSaleAdjustments: new Map(
        wash.adjustments.map((a) => [a.lossEventId, a]),
      ),
    });
    const shortLine = form.lines.find((x) => x.holdingPeriod === "SHORT_TERM")!;
    const longLine = form.lines.find((x) => x.holdingPeriod === "LONG_TERM")!;
    expect(longLine.adjustmentCode).toBe("");
    expect(shortLine.adjustmentCode).toBe("W");
    expect(shortLine.adjustmentAmount).toBeLessThanOrEqual(
      Math.abs(st.gainLoss) + 0.01,
    );
  });

  // A wash sale is judged on the units sold at a loss, part by part.
  describe("wash sale is judged per part", () => {
    const lotsWith = (longCost: number): TaxLot[] => [
      {
        id: "old",
        asset: "SOL",
        amount: 1,
        costBasisUsd: longCost,
        acquiredAt: new Date("2025-01-10T10:00:00Z"),
        sourceId: "cb",
      },
      {
        id: "new",
        asset: "SOL",
        amount: 1,
        costBasisUsd: 200,
        acquiredAt: new Date("2025-10-10T10:00:00Z"),
        sourceId: "cb",
      },
    ];
    const rebuy = [
      {
        lotId: "rebuy",
        asset: "SOL",
        amount: 5,
        acquiredAt: new Date("2026-03-30T10:00:00Z"),
      },
    ];
    const run = (longCost: number) => {
      // 2 units sold for 200: the long part (cost longCost) gains, the short part (cost 200) loses 100
      const r = calculateFIFO(
        lotsWith(longCost),
        event({ amount: 2, proceedsUsd: 200, feeUsd: 0 }),
        true,
      );
      const wash = detectWashSales([r], rebuy, new Set());
      const form = generateForm8949([r], {
        taxYear: 2026,
        washSaleAdjustments: new Map(
          wash.adjustments.map((a) => [a.lossEventId, a]),
        ),
      });
      return { r, wash, form, carry: computeWashSaleCarryover([r], rebuy) };
    };

    it("a loss on the short part is disallowed although the whole sale broke even", () => {
      const { r, wash, form, carry } = run(0); // long gains 100, short loses 100
      expect(r.gainLoss).toBeCloseTo(0, 9);
      // positive control: judged on the whole sale nothing would be a loss
      expect(wash.adjustments).toHaveLength(1);
      expect(wash.adjustments[0].lossEventId).toBe("s1~ST");
      expect(wash.adjustments[0].disallowedLoss).toBe(100);
      const st = form.lines.find((l) => l.holdingPeriod === "SHORT_TERM")!;
      const lt = form.lines.find((l) => l.holdingPeriod === "LONG_TERM")!;
      expect(st.adjustmentCode).toBe("W");
      expect(st.adjustmentAmount).toBe(100);
      expect(st.gainLoss).toBe(0);
      expect(lt.adjustmentCode).toBe("");
      expect(lt.gainLoss).toBe(100);
      // the same amount is added to the replacement lot for later years
      expect(carry.extraCost.get("rebuy")).toBeCloseTo(100, 9);
    });

    it("the whole loss of the short part is disallowed, not the net loss of the sale", () => {
      const { r, wash, form } = run(60); // long gains 40, short loses 100, net -60
      expect(r.gainLoss).toBeCloseTo(-60, 9);
      expect(wash.adjustments[0].disallowedLoss).toBe(100); // not 60
      const st = form.lines.find((l) => l.holdingPeriod === "SHORT_TERM")!;
      expect(st.gainLoss).toBe(0);
    });

    it("negative control: a sale on one side of the line keeps its own id for the wash sale", () => {
      const l = lotsWith(0).slice(1); // only the short-term lot
      const r = calculateFIFO(
        l,
        event({ amount: 1, proceedsUsd: 100, feeUsd: 0 }),
        true,
      );
      const wash = detectWashSales([r], rebuy, new Set());
      expect(wash.adjustments[0].lossEventId).toBe("s1");
    });
  });

  it("the parts of a sale add up to its proceeds to the cent", () => {
    const l: TaxLot[] = [
      {
        id: "a",
        asset: "SOL",
        amount: 1,
        costBasisUsd: 10,
        acquiredAt: new Date("2025-01-10T10:00:00Z"),
        sourceId: "cb",
      },
      {
        id: "b",
        asset: "SOL",
        amount: 1,
        costBasisUsd: 10,
        acquiredAt: new Date("2025-10-10T10:00:00Z"),
        sourceId: "cb",
      },
    ];
    const r = calculateFIFO(
      l,
      event({ amount: 2, proceedsUsd: 100.01, feeUsd: 0.01 }),
      true,
    );
    const legs = termLegs(r);
    expect(legs[0].proceedsUsd + legs[1].proceedsUsd).toBeCloseTo(100.01, 9);
    expect(legs[0].feeUsd + legs[1].feeUsd).toBeCloseTo(0.01, 9);
    const form = generateForm8949([r], { taxYear: 2026 });
    expect(form.lines.reduce((s, x) => s + x.proceeds, 0)).toBeCloseTo(
      100.01,
      9,
    );
  });

  it("specific id: lots picked on both sides of the line split too", () => {
    const l = lots();
    const r = calculateSpecificId(l, event({ amount: 2 }), [
      { lotId: "old", amount: 1 },
      { lotId: "new", amount: 1 },
    ]);
    expect(r.holdingPeriod).toBe("MIXED");
    expect(termLegs(r).map((x) => x.amount)).toEqual([1, 1]);
  });

  it("a zero-unit pick does not make a sale mixed", () => {
    const l = lots();
    const r = calculateSpecificId(l, event({ amount: 1 }), [
      { lotId: "old", amount: 0 },
      { lotId: "new", amount: 1 },
    ]);
    expect(r.holdingPeriod).toBe("SHORT_TERM");
    expect(generateForm8949([r], { taxYear: 2026 }).lines).toHaveLength(1);
  });

  it("only units with no lot: one short-term line", () => {
    const r = calculateFIFO([], event({ amount: 1, proceedsUsd: 100 }), true);
    expect(r.holdingPeriod).toBe("SHORT_TERM");
    expect(termLegs(r)).toHaveLength(1);
  });

  it("zero fee gives zero fee on both parts", () => {
    const r = calculateFIFO(lots(), event({ feeUsd: 0 }), true);
    expect(termLegs(r).map((x) => x.feeUsd)).toEqual([0, 0]);
  });

  it("with separate wallets a sale only takes lots from its own wallet", () => {
    const l = lots();
    l[0].sourceId = "other"; // the long-term lot is in another wallet
    const r = calculateFIFO(l, event({ amount: 1 }), true);
    expect(r.holdingPeriod).toBe("SHORT_TERM");
    expect(r.matchedLots.map((m) => m.lotId)).toEqual(["new"]);
  });

  it("two sales drawing on the same lots: the second sees what is left", () => {
    const l = lots();
    const first = calculateFIFO(l, event({ amount: 1.5, id: "a" }), true);
    expect(first.holdingPeriod).toBe("LONG_TERM");
    const second = calculateFIFO(l, event({ amount: 1.5, id: "b" }), true);
    // 0.5 left of the long-term lot, then the short-term lot
    expect(second.holdingPeriod).toBe("MIXED");
    const [st, lt] = termLegs(second);
    expect(lt.amount).toBeCloseTo(0.5, 9);
    expect(st.amount).toBeCloseTo(1, 9);
  });

  it("pooled methods are not cut up: one result, one period", () => {
    for (const method of [
      "PMPA",
      "TOTAL_AVERAGE",
      "UK_SHARE_POOLING",
    ] as const) {
      const calc = new CostBasisCalculator(method);
      calc.addLots(lots());
      const r = calc.calculate(event(), true);
      expect(r.holdingPeriod).not.toBe("MIXED");
      expect(termLegs(r)).toHaveLength(1);
    }
  });
});

describe("the one-year line is a calendar-day rule", () => {
  const at = (acq: string, sold: string) =>
    getHoldingPeriod(new Date(acq), new Date(sold));

  it.each([
    // bought 24 Mar 2025 10:00: long term from a sale on 25 Mar 2026, any time of day
    ["2025-03-24T10:00:00Z", "2026-03-24T23:59:59Z", "SHORT_TERM"],
    ["2025-03-24T10:00:00Z", "2026-03-25T00:00:00Z", "LONG_TERM"],
    ["2025-03-24T10:00:00Z", "2026-03-25T09:59:00Z", "LONG_TERM"],
    ["2025-03-24T23:30:00Z", "2026-03-25T00:30:00Z", "LONG_TERM"],
    // a 29 February start: long term from 1 March of the next year
    ["2024-02-29T10:00:00Z", "2025-02-28T12:00:00Z", "SHORT_TERM"],
    ["2024-02-29T10:00:00Z", "2025-03-01T00:00:00Z", "LONG_TERM"],
    // across a leap year
    ["2023-03-01T10:00:00Z", "2024-03-01T12:00:00Z", "SHORT_TERM"],
    ["2023-03-01T10:00:00Z", "2024-03-02T00:00:00Z", "LONG_TERM"],
  ])("bought %s, sold %s is %s", (acq, sold, want) => {
    expect(at(acq, sold)).toBe(want);
  });

  it("the simulator, the portfolio view and harvesting use the same line", () => {
    // sold on the anniversary: still short term everywhere
    const acq = new Date("2025-03-24T10:00:00Z");
    expect(longTermStartDate(acq).toISOString()).toBe(
      "2026-03-25T00:00:00.000Z",
    );
    const analysis = analyzeHoldings(
      [
        {
          id: "x",
          asset: "SOL",
          amount: 1,
          costBasisUsd: 10,
          acquiredAt: acq,
          sourceId: "cb",
        },
      ],
      undefined,
      new Date("2026-03-24T12:00:00Z"),
    );
    expect(analysis.positions[0].lots[0].isLongTerm).toBe(false);
    const day2 = analyzeHoldings(
      [
        {
          id: "x",
          asset: "SOL",
          amount: 1,
          costBasisUsd: 10,
          acquiredAt: acq,
          sourceId: "cb",
        },
      ],
      undefined,
      new Date("2026-03-25T00:30:00Z"),
    );
    expect(day2.positions[0].lots[0].isLongTerm).toBe(true);
  });
});

describe("Germany FIFO labels the taxable part short-term", () => {
  it("a sale of one exempt and one taxable lot reports short-term", () => {
    const r = calculateGermanyFIFO(
      [
        {
          id: "old",
          asset: "SOL",
          amount: 1,
          costBasisUsd: 100,
          acquiredAt: new Date("2024-01-01T00:00:00Z"),
          sourceId: "cb",
        },
        {
          id: "new",
          asset: "SOL",
          amount: 1,
          costBasisUsd: 100,
          acquiredAt: new Date("2025-12-01T00:00:00Z"),
          sourceId: "cb",
        },
      ],
      event({ amount: 2, proceedsUsd: 400, feeUsd: 0 }),
      true,
    );
    // only the lot held 12 months or less is taxable, so its gain is short-term
    expect(r.holdingPeriod).toBe("SHORT_TERM");
  });
});
