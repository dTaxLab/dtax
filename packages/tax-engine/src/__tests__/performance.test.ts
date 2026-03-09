/**
 * Performance benchmark tests.
 *
 * Validates tax engine performance with realistic large datasets.
 * Asserts sub-second computation for typical user volumes.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import { detectWashSales } from "../wash-sale";
import { generateForm8949 } from "../reports/form8949";
import type { TaxLot, TaxableEvent, CostBasisMethod } from "../types";
import type { AcquisitionRecord } from "../wash-sale";

// ─── Data Generators ─────────────────────────────────

const ASSETS = ["BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "DOT", "MATIC"];

function generateLots(count: number): TaxLot[] {
  const lots: TaxLot[] = [];
  const baseDate = new Date("2023-01-01");
  for (let i = 0; i < count; i++) {
    const asset = ASSETS[i % ASSETS.length];
    lots.push({
      id: `lot-${i}`,
      asset,
      amount: 1 + Math.random() * 10,
      costBasisUsd: 100 + Math.random() * 50000,
      acquiredAt: new Date(baseDate.getTime() + i * 3600000),
      sourceId: `exchange-${i % 3}`,
    });
  }
  return lots;
}

function generateEvents(count: number, yearOffset: number = 1): TaxableEvent[] {
  const events: TaxableEvent[] = [];
  const baseDate = new Date(`${2023 + yearOffset}-01-15`);
  for (let i = 0; i < count; i++) {
    const asset = ASSETS[i % ASSETS.length];
    events.push({
      id: `evt-${i}`,
      asset,
      amount: 0.5 + Math.random() * 2,
      proceedsUsd: 200 + Math.random() * 60000,
      date: new Date(baseDate.getTime() + i * 7200000),
      sourceId: `exchange-${i % 3}`,
      feeUsd: Math.random() * 50,
    });
  }
  return events;
}

function timeExec(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// ─── FIFO Performance ────────────────────────────────

describe("FIFO performance", () => {
  it("1,000 lots + 500 events under 200ms", () => {
    const lots = generateLots(1000);
    const events = generateEvents(500);
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(lots);

    const ms = timeExec(() => {
      for (const e of events) calc.calculate(e);
    });

    expect(ms).toBeLessThan(200);
  });

  it("5,000 lots + 2,000 events under 500ms", () => {
    const lots = generateLots(5000);
    const events = generateEvents(2000);
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(lots);

    const ms = timeExec(() => {
      for (const e of events) calc.calculate(e);
    });

    expect(ms).toBeLessThan(500);
  });

  it("10,000 lots + 5,000 events under 2000ms", () => {
    const lots = generateLots(10000);
    const events = generateEvents(5000);
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(lots);

    const ms = timeExec(() => {
      for (const e of events) calc.calculate(e);
    });

    expect(ms).toBeLessThan(2000);
  });
});

// ─── HIFO Performance ────────────────────────────────

describe("HIFO performance", () => {
  it("5,000 lots + 2,000 events under 1000ms", () => {
    const lots = generateLots(5000);
    const events = generateEvents(2000);
    const calc = new CostBasisCalculator("HIFO");
    calc.addLots(lots);

    const ms = timeExec(() => {
      for (const e of events) calc.calculate(e);
    });

    expect(ms).toBeLessThan(1000);
  });
});

// ─── Multi-Method Comparison ─────────────────────────

describe("method comparison at scale", () => {
  const methods: CostBasisMethod[] = ["FIFO", "LIFO", "HIFO"];

  it("all methods handle 3,000 lots + 1,500 events under 1000ms each", () => {
    for (const method of methods) {
      const lots = generateLots(3000);
      const events = generateEvents(1500);
      const calc = new CostBasisCalculator(method);
      calc.addLots(lots);

      const ms = timeExec(() => {
        for (const e of events) calc.calculate(e);
      });

      expect(ms).toBeLessThan(1000);
    }
  });
});

// ─── Wash Sale Detection Performance ─────────────────

describe("wash sale detection performance", () => {
  it("1,000 results with wash sale scan under 500ms", () => {
    const lots = generateLots(2000);
    const events = generateEvents(1000);
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(lots);
    const results = events.map((e) => calc.calculate(e));

    const acqRecords: AcquisitionRecord[] = lots.map((l) => ({
      lotId: l.id,
      asset: l.asset,
      amount: l.amount,
      acquiredAt: l.acquiredAt,
    }));
    const consumedIds = new Set(
      results.flatMap((r) => r.matchedLots.map((m) => m.lotId)),
    );

    const ms = timeExec(() => {
      detectWashSales(results, acqRecords, consumedIds);
    });

    expect(ms).toBeLessThan(500);
  });
});

// ─── Form 8949 Generation Performance ────────────────

describe("Form 8949 generation performance", () => {
  it("2,000 results → Form 8949 under 200ms", () => {
    const lots = generateLots(4000);
    const events = generateEvents(2000);
    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(lots);
    const results = events.map((e) => calc.calculate(e));
    const lotDates = new Map(lots.map((l) => [l.id, l.acquiredAt]));

    const ms = timeExec(() => {
      generateForm8949(results, {
        taxYear: 2024,
        lotDates,
        reportingBasis: "none",
      });
    });

    expect(ms).toBeLessThan(200);
  });
});

// ─── Single-Asset Deep Stack ─────────────────────────

describe("single-asset deep lot stack", () => {
  it("10,000 BTC lots + 5,000 sells (FIFO) under 1500ms", () => {
    const lots: TaxLot[] = [];
    for (let i = 0; i < 10000; i++) {
      lots.push({
        id: `btc-lot-${i}`,
        asset: "BTC",
        amount: 0.01,
        costBasisUsd: 300 + i * 0.5,
        acquiredAt: new Date(2023, 0, 1, 0, 0, i),
        sourceId: "coinbase",
      });
    }

    const events: TaxableEvent[] = [];
    for (let i = 0; i < 5000; i++) {
      events.push({
        id: `btc-sell-${i}`,
        asset: "BTC",
        amount: 0.01,
        proceedsUsd: 500 + i * 0.3,
        date: new Date(2024, 5, 1, 0, 0, i),
        sourceId: "coinbase",
        feeUsd: 1,
      });
    }

    const calc = new CostBasisCalculator("FIFO");
    calc.addLots(lots);

    const ms = timeExec(() => {
      for (const e of events) calc.calculate(e);
    });

    expect(ms).toBeLessThan(1500);
  });
});
