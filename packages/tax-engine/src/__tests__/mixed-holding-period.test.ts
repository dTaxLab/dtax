/**
 * A sale that takes units from lots on both sides of the one-year line reports
 * as a short-term part and a long-term part, not as one period decided by the
 * earliest lot.
 */
import { describe, it, expect } from "vitest";
import { calculateFIFO } from "../methods/fifo";
import { calculateLIFO } from "../methods/lifo";
import { calculateHIFO } from "../methods/hifo";
import { generateForm8949 } from "../reports/form8949";
import { generateScheduleD } from "../reports/schedule-d";
import { detectWashSales } from "../wash-sale";
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

  it("the old behaviour is the positive control: the whole sale used to be long term", () => {
    // the earliest lot (Jan 2025) is long term; deciding by it alone would put
    // the 0.5 short-term units on the long-term side
    const r = calculateFIFO(lots(), event(), true);
    const [st] = termLegs(r);
    expect(st.amount).toBeCloseTo(0.5, 9);
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
});
