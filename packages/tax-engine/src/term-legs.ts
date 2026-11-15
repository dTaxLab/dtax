/**
 * Splitting a sale by holding period.
 *
 * A sale that takes units from lots on both sides of the one-year line is not
 * one short-term or long-term disposal: each lot is held for its own period, so
 * the sale reports as one short-term part and one long-term part (separate
 * lines on Form 8949, each in its own box). A sale stays one calculation result
 * everywhere else; this is the one place that cuts it up for reporting.
 * @license AGPL-3.0
 */
import type { CalculationResult, HoldingPeriod, MatchedLot } from "./types";
import { dadd, ddiv, dmul, dsub, roundCents } from "./math";

/** The part of a sale that has one holding period. */
export interface TermLeg {
  holdingPeriod: HoldingPeriod;
  /** Units of the sale in this part. */
  amount: number;
  /** Share of the sale's proceeds, by units. */
  proceedsUsd: number;
  /** Share of the sale's fee, by units. */
  feeUsd: number;
  /** Cost of the lots in this part. */
  costBasisUsd: number;
  /** proceeds - cost - fee for this part. */
  gainLoss: number;
  matchedLots: MatchedLot[];
  /** Units with no lot; they are always in the short-term part. */
  unmatchedAmount: number;
  /** True when the sale was cut up, so each part needs its own identifier. */
  split: boolean;
}

/** Identifier of a part of a sale: the sale's own id when it was not cut up. */
export function termLegId(eventId: string, leg: TermLeg): string {
  if (!leg.split) return eventId;
  return `${eventId}~${leg.holdingPeriod === "LONG_TERM" ? "LT" : "ST"}`;
}

/**
 * The parts of a sale by holding period, short-term first. One part for a sale
 * that sits on one side of the line, two for one that spans it. Units with no
 * lot have no acquisition date and are reported short-term.
 */
export function termLegs(result: CalculationResult): TermLeg[] {
  const { event, matchedLots, holdingPeriod } = result;
  const unmatched = result.unmatchedAmount ?? 0;
  const feeUsd = event.feeUsd ?? 0;
  const cost = (lots: MatchedLot[]) =>
    lots.reduce((s, l) => dadd(s, l.costBasisUsd), 0);

  if (holdingPeriod !== "MIXED") {
    return [
      {
        holdingPeriod,
        amount: event.amount,
        proceedsUsd: event.proceedsUsd,
        feeUsd,
        costBasisUsd: cost(matchedLots),
        gainLoss: result.gainLoss,
        matchedLots,
        unmatchedAmount: unmatched,
        split: false,
      },
    ];
  }

  const shortLots = matchedLots.filter((m) => m.holdingPeriod !== "LONG_TERM");
  const longLots = matchedLots.filter((m) => m.holdingPeriod === "LONG_TERM");
  const units = (lots: MatchedLot[]) =>
    lots.reduce((s, l) => dadd(s, l.amountConsumed), 0);
  const shortUnits = dadd(units(shortLots), unmatched);
  const longUnits = units(longLots);
  const total = dadd(shortUnits, longUnits);

  // Each share is rounded to the cent, as it is printed on its Form 8949 line,
  // and the long-term part takes the remainder so the parts add up to the sale
  // to the cent (two halves of 100.01 are 50.01 and 50.00, not 50.01 and 50.01).
  const shortProceeds = roundCents(
    dmul(event.proceedsUsd, ddiv(shortUnits, total)),
  );
  const shortFee = roundCents(dmul(feeUsd, ddiv(shortUnits, total)));
  const part = (
    holdingPeriod: HoldingPeriod,
    lots: MatchedLot[],
    amount: number,
    proceedsUsd: number,
    fee: number,
    unmatchedAmount: number,
  ): TermLeg => {
    const lotsCost = cost(lots);
    return {
      holdingPeriod,
      amount,
      proceedsUsd,
      feeUsd: fee,
      costBasisUsd: lotsCost,
      gainLoss: dsub(dsub(proceedsUsd, lotsCost), fee),
      matchedLots: lots,
      unmatchedAmount,
      split: true,
    };
  };
  return [
    part(
      "SHORT_TERM",
      shortLots,
      shortUnits,
      shortProceeds,
      shortFee,
      unmatched,
    ),
    part(
      "LONG_TERM",
      longLots,
      longUnits,
      dsub(event.proceedsUsd, shortProceeds),
      dsub(feeUsd, shortFee),
      0,
    ),
  ];
}

export interface GainTotals {
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
}

/** Anything with a gain or loss and one holding period: a part of a sale or a Form 8949 line. */
export interface GainPart {
  gainLoss: number;
  holdingPeriod: HoldingPeriod;
}

/**
 * Split disposal results into gain and loss totals per holding period, each
 * part of a disposal (see termLegs) rounded to cents first, like its Form 8949
 * line. Losses are positive numbers.
 */
export function summarizeGains(
  results: ReadonlyArray<CalculationResult>,
): GainTotals {
  // Only a sale that spans the one-year line needs cutting up.
  return summarizeGainParts(
    results.flatMap((r) =>
      r.holdingPeriod === "MIXED"
        ? termLegs(r)
        : [{ gainLoss: r.gainLoss, holdingPeriod: r.holdingPeriod }],
    ),
  );
}

/**
 * The same totals from parts that already have one holding period each, such
 * as the lines of a stored Form 8949.
 */
export function summarizeGainParts(parts: ReadonlyArray<GainPart>): GainTotals {
  const t: GainTotals = {
    shortTermGains: 0,
    shortTermLosses: 0,
    longTermGains: 0,
    longTermLosses: 0,
  };
  for (const p of parts) {
    const gl = roundCents(p.gainLoss);
    if (p.holdingPeriod === "SHORT_TERM") {
      if (gl >= 0) t.shortTermGains += gl;
      else t.shortTermLosses += Math.abs(gl);
    } else if (gl >= 0) t.longTermGains += gl;
    else t.longTermLosses += Math.abs(gl);
  }
  // Adding cent values as floats leaves noise such as 1335.7799999999997.
  return {
    shortTermGains: roundCents(t.shortTermGains),
    shortTermLosses: roundCents(t.shortTermLosses),
    longTermGains: roundCents(t.longTermGains),
    longTermLosses: roundCents(t.longTermLosses),
  };
}
