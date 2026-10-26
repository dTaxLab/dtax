/**
 * Wallet-by-wallet cost basis: units moved between the taxpayer's own wallets
 * keep their acquisition date and cost (26 CFR 1.1012-1(j)(1)).
 *
 * @license AGPL-3.0
 */
import { describe, it, expect, vi } from "vitest";
import { CostBasisCalculator } from "../calculator";
import { baseLotId } from "../methods/shared";
import type { TaxLot, TaxableEvent, TransferEvent } from "../types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const lot = (
  id: string,
  amount: number,
  cost: number,
  day: string,
  src: string,
): TaxLot => ({
  id,
  asset: "BTC",
  amount,
  costBasisUsd: cost,
  acquiredAt: d(day),
  sourceId: src,
});
const sale = (
  id: string,
  amount: number,
  proceeds: number,
  day: string,
  src: string,
): TaxableEvent => ({
  id,
  asset: "BTC",
  amount,
  proceedsUsd: proceeds,
  date: d(day),
  sourceId: src,
});
const move = (
  id: string,
  amount: number,
  day: string,
  from: string,
  to: string,
): TransferEvent => ({
  id,
  asset: "BTC",
  amount,
  date: d(day),
  fromSourceId: from,
  toSourceId: to,
});

describe("transfers between own wallets (strict wallet-by-wallet)", () => {
  it("a sale from the receiving wallet uses the transferred lot, with its original date and cost", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 1, 30000, "2023-03-01", "exchange")]);
    c.registerTransfers([move("T", 1, "2025-01-10", "exchange", "ledger")]);
    const r = c.calculate(sale("S", 1, 50000, "2025-06-01", "ledger"), true);
    expect(r.matchedLots[0]).toMatchObject({ lotId: "L", costBasisUsd: 30000 });
    expect(r.gainLoss).toBe(20000);
    expect(r.holdingPeriod).toBe("LONG_TERM"); // held since 2023, not since the transfer
    expect(r.unmatchedAmount ?? 0).toBe(0);
  });

  // Negative control: without the transfer the sale has no cost (the old behaviour).
  it("without the transfer the same sale finds no lot", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 1, 30000, "2023-03-01", "exchange")]);
    const r = c.calculate(sale("S", 1, 50000, "2025-06-01", "ledger"), true);
    expect(r.unmatchedAmount).toBe(1);
  });

  it("a partial transfer splits the lot and its cost in proportion", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 10, 1000, "2024-01-01", "exchange")]);
    c.registerTransfers([move("T", 4, "2025-02-01", "exchange", "ledger")]);
    const r = c.calculate(sale("S", 4, 800, "2025-03-01", "ledger"), true);
    expect(r.gainLoss).toBe(400); // 800 - 4/10 of 1000
    expect(baseLotId(r.matchedLots[0].lotId)).toBe("L");
    const left = c.getLots().filter((l) => l.sourceId === "exchange");
    expect(left[0]).toMatchObject({ amount: 6, costBasisUsd: 600 });
  });

  it("moves the earliest lots first and keeps each lot's own cost", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([
      lot("old", 1, 100, "2022-01-01", "exchange"),
      lot("new", 1, 900, "2024-01-01", "exchange"),
    ]);
    c.registerTransfers([move("T", 1, "2025-01-01", "exchange", "ledger")]);
    const r = c.calculate(sale("S", 1, 1000, "2025-06-01", "ledger"), true);
    expect(r.matchedLots[0]).toMatchObject({ lotId: "old", costBasisUsd: 100 });
  });

  it("only lots acquired before the transfer can move", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("later", 1, 500, "2025-03-01", "exchange")]);
    c.registerTransfers([move("T", 1, "2025-01-01", "exchange", "ledger")]);
    const r = c.calculate(sale("S", 1, 900, "2025-06-01", "ledger"), true);
    expect(r.unmatchedAmount).toBe(1);
  });

  it("the sending wallet no longer has the units", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 1, 30000, "2023-03-01", "exchange")]);
    c.registerTransfers([move("T", 1, "2025-01-10", "exchange", "ledger")]);
    const r = c.calculate(sale("S", 1, 50000, "2025-06-01", "exchange"), true);
    expect(r.unmatchedAmount).toBe(1);
  });

  it("transfers are applied in date order between sales", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 2, 2000, "2023-01-01", "exchange")]);
    c.registerTransfers([move("T", 1, "2025-03-01", "exchange", "ledger")]);
    const first = c.calculate(
      sale("S1", 1, 1500, "2025-02-01", "exchange"),
      true,
    ); // before the transfer
    const second = c.calculate(
      sale("S2", 1, 1500, "2025-04-01", "ledger"),
      true,
    );
    expect(first.unmatchedAmount ?? 0).toBe(0);
    expect(second.unmatchedAmount ?? 0).toBe(0);
  });

  it("in all-holdings mode transfers are ignored (nothing is split or renamed)", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 10, 1000, "2024-01-01", "exchange")]);
    c.registerTransfers([move("T", 4, "2025-02-01", "exchange", "ledger")]);
    const r = c.calculate(sale("S", 4, 800, "2025-03-01", "ledger"), false);
    expect(r.matchedLots[0].lotId).toBe("L");
    expect(c.getLots()).toHaveLength(1);
  });

  it("registering the same transfer twice moves the units once", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 2, 2000, "2023-01-01", "exchange")]);
    const t = move("T", 1, "2025-01-01", "exchange", "ledger");
    c.registerTransfers([t]);
    c.registerTransfers([t]);
    c.calculate(sale("S", 0.5, 800, "2025-06-01", "ledger"), true);
    expect(
      c
        .getLots()
        .filter((l) => l.sourceId === "ledger")
        .reduce((n, l) => n + l.amount, 0),
    ).toBeCloseTo(0.5);
  });
});

describe("transfers and consume-only sales share one timeline (review fixes)", () => {
  it("an unpriced sale before a transfer uses the lot in the sending wallet", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([
      lot("L1", 1, 100, "2024-01-01", "A"),
      lot("L2", 1, 500, "2024-01-02", "B"),
    ]);
    c.registerConsumptionEvents([sale("U", 1, 0, "2025-01-10", "A")]); // no price
    c.registerTransfers([move("T", 1, "2025-01-20", "A", "B")]);
    // L1 went to the unpriced sale first, so the transfer has nothing to carry
    const r = c.calculate(sale("S", 1, 900, "2025-02-01", "B"), true);
    expect(r.matchedLots[0]).toMatchObject({ lotId: "L2", costBasisUsd: 500 });
  });

  it("an unpriced sale after a transfer finds the lot in the receiving wallet", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L1", 1, 100, "2024-01-01", "A")]);
    c.registerTransfers([move("T", 1, "2025-01-10", "A", "B")]);
    c.registerConsumptionEvents([sale("U", 1, 0, "2025-01-20", "B")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = c.calculate(sale("S", 1, 900, "2025-02-01", "B"), true);
    expect(r.unmatchedAmount).toBe(1); // L1 is already used by the unpriced sale in B
  });

  it("the fee units leave the sending wallet instead of lingering as a phantom lot", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 1, 1000, "2024-01-01", "A")]);
    c.registerTransfers([
      { ...move("T", 0.99, "2025-01-10", "A", "B"), feeAmount: 0.01 },
    ]);
    c.calculate(sale("S", 0.5, 800, "2025-02-01", "B"), true);
    const inA = c
      .getLots()
      .filter((l) => l.sourceId === "A")
      .reduce((n, l) => n + l.amount, 0);
    expect(inA).toBeCloseTo(0, 9); // nothing left to be sold from A by mistake
    const inB = c
      .getLots()
      .filter((l) => l.sourceId === "B")
      .reduce((n, l) => n + l.amount, 0);
    expect(inB).toBeCloseTo(0.49, 9);
  });

  it("a transfer to the same wallet does nothing", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 2, 200, "2024-01-01", "A")]);
    c.registerTransfers([move("T", 1, "2025-01-10", "A", "A")]);
    c.calculate(sale("S", 1, 300, "2025-02-01", "A"), true);
    expect(c.getLots().every((l) => !l.id.includes("~t"))).toBe(true);
  });

  it("at the same instant the transfer comes first", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 1, 100, "2024-01-01", "A")]);
    c.registerTransfers([move("T", 1, "2025-01-10", "A", "B")]);
    const r = c.calculate(sale("S", 1, 300, "2025-01-10", "B"), true);
    expect(r.unmatchedAmount ?? 0).toBe(0);
  });
});

describe("review round 3 (engine)", () => {
  it("registering again after calculating never repeats what already ran", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([
      lot("L1", 4, 400, "2023-01-01", "A"),
      lot("L2", 4, 400, "2023-01-02", "A"),
    ]);
    const t1 = move("T1", 4, "2025-01-10", "A", "B");
    c.registerTransfers([t1]);
    c.calculate(sale("S1", 0.1, 10, "2025-02-01", "B"), true);
    c.registerTransfers([t1, move("T2", 1, "2025-03-01", "A", "B")]);
    c.calculate(sale("S2", 0.1, 10, "2025-03-05", "B"), true);
    c.registerTransfers([t1, move("T2", 1, "2025-03-01", "A", "B")]); // third time
    c.calculate(sale("S3", 0.1, 10, "2025-04-01", "B"), true);
    const inA = c
      .getLots()
      .filter((l) => l.sourceId === "A")
      .reduce((n, l) => n + l.amount, 0);
    expect(inA).toBeCloseTo(3, 9); // 8 held - 4 (T1) - 1 (T2), once each
  });

  it("consume-only sales are not consumed twice either", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([lot("L", 10, 1000, "2023-01-01", "A")]);
    const u1 = sale("U1", 3, 0, "2025-01-10", "A");
    c.registerConsumptionEvents([u1]);
    c.calculate(sale("S1", 1, 100, "2025-02-01", "A"));
    c.registerConsumptionEvents([u1, sale("U2", 2, 0, "2025-02-05", "A")]);
    c.calculate(sale("S2", 1, 100, "2025-03-01", "A"));
    c.registerConsumptionEvents([u1]);
    c.calculate(sale("S3", 1, 100, "2025-04-01", "A"));
    expect(c.getLots().reduce((n, l) => n + l.amount, 0)).toBeCloseTo(
      10 - 3 - 2 - 3,
      9,
    );
  });

  it("only sales count as consuming a lot; a transfer or its fee does not", () => {
    const c = new CostBasisCalculator("FIFO");
    c.addLots([
      lot("L", 2, 200, "2023-01-01", "A"),
      lot("M", 1, 100, "2023-02-01", "A"),
    ]);
    c.registerTransfers([
      { ...move("T", 0.99, "2025-01-10", "A", "B"), feeAmount: 0.01 },
    ]);
    c.calculate(sale("S", 0.5, 100, "2025-02-01", "B"), true);
    expect([...c.consumedLotIds()]).toEqual(["L"]); // the sale used L; M was never touched
  });
});
