import { describe, it, expect } from "vitest";
import { reconcile } from "../reconciliation/reconciler";
import type { Form1099DAEntry, DtaxDisposition } from "../reconciliation/types";

function makeBroker(overrides: Partial<Form1099DAEntry> = {}): Form1099DAEntry {
  return {
    rowIndex: 1,
    asset: "BTC",
    dateSold: new Date("2026-09-20"),
    grossProceeds: 50000,
    ...overrides,
  };
}

function makeDtax(overrides: Partial<DtaxDisposition> = {}): DtaxDisposition {
  return {
    eventId: "e1",
    asset: "BTC",
    dateSold: new Date("2026-09-20"),
    proceeds: 50000,
    costBasis: 45000,
    gainLoss: 5000,
    ...overrides,
  };
}

describe("1099-DA Covered vs Noncovered", () => {
  it("should mark entries as covered when acquired on/after 2026-01-01 with cost basis", () => {
    const broker = [
      makeBroker({
        dateAcquired: new Date("2026-03-15"),
        costBasis: 45000,
        gainLoss: 5000,
      }),
    ];
    const dtax = [makeDtax()];
    const result = reconcile(broker, dtax, {
      taxYear: 2026,
      brokerName: "Coinbase",
    });
    expect(result.items[0].coverageStatus).toBe("covered");
    expect(result.summary.coveredCount).toBe(1);
    expect(result.summary.noncoveredCount).toBe(0);
  });

  it("should mark entries as noncovered when acquired before 2026-01-01", () => {
    const broker = [
      makeBroker({
        asset: "ETH",
        dateAcquired: new Date("2024-06-01"),
        dateSold: new Date("2026-04-10"),
        grossProceeds: 3000,
        costBasis: 2000,
        gainLoss: 1000,
      }),
    ];
    const dtax = [
      makeDtax({
        eventId: "e2",
        asset: "ETH",
        dateSold: new Date("2026-04-10"),
        proceeds: 3000,
        costBasis: 2000,
        gainLoss: 1000,
      }),
    ];
    const result = reconcile(broker, dtax, {
      taxYear: 2026,
      brokerName: "Coinbase",
    });
    expect(result.items[0].coverageStatus).toBe("noncovered");
    expect(result.summary.noncoveredCount).toBe(1);
  });

  it("should mark entries as noncovered when costBasis is null (transferred-in assets)", () => {
    const broker = [
      makeBroker({
        dateAcquired: new Date("2026-05-01"),
        costBasis: undefined,
      }),
    ];
    const dtax = [makeDtax()];
    const result = reconcile(broker, dtax, {
      taxYear: 2026,
      brokerName: "Kraken",
    });
    expect(result.items[0].coverageStatus).toBe("noncovered");
  });

  it("should mark entries as noncovered when costBasis is 0", () => {
    const broker = [
      makeBroker({
        dateAcquired: new Date("2026-05-01"),
        costBasis: 0,
      }),
    ];
    const dtax = [makeDtax()];
    const result = reconcile(broker, dtax, {
      taxYear: 2026,
      brokerName: "Kraken",
    });
    expect(result.items[0].coverageStatus).toBe("noncovered");
  });

  it("should mark entries as noncovered when dateAcquired is missing", () => {
    const broker = [
      makeBroker({
        costBasis: 45000,
        // no dateAcquired = likely transferred in
      }),
    ];
    const dtax = [makeDtax()];
    const result = reconcile(broker, dtax, {
      taxYear: 2026,
      brokerName: "Gemini",
    });
    expect(result.items[0].coverageStatus).toBe("noncovered");
  });

  it("should mark missing_in_1099da entries as unknown coverage", () => {
    const broker: Form1099DAEntry[] = [];
    const dtax = [makeDtax()];
    const result = reconcile(broker, dtax, {
      taxYear: 2026,
      brokerName: "Coinbase",
    });
    expect(result.items[0].coverageStatus).toBe("unknown");
    expect(result.items[0].status).toBe("missing_in_1099da");
  });

  it("should count covered and noncovered in summary", () => {
    const broker = [
      makeBroker({
        rowIndex: 1,
        dateAcquired: new Date("2026-03-15"),
        costBasis: 45000,
        gainLoss: 5000,
      }),
      makeBroker({
        rowIndex: 2,
        asset: "ETH",
        dateAcquired: new Date("2024-01-01"),
        grossProceeds: 2000,
        costBasis: 1500,
        gainLoss: 500,
      }),
    ];
    const dtax = [
      makeDtax(),
      makeDtax({
        eventId: "e2",
        asset: "ETH",
        proceeds: 2000,
        costBasis: 1500,
        gainLoss: 500,
      }),
    ];
    const result = reconcile(broker, dtax, {
      taxYear: 2026,
      brokerName: "Coinbase",
    });
    expect(result.summary.coveredCount).toBe(1);
    expect(result.summary.noncoveredCount).toBe(1);
  });
});
