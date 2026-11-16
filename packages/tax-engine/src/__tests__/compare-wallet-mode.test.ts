/**
 * Wallet-by-wallet mode in the method comparison: the US methods (FIFO, LIFO,
 * HIFO) sell only from the chosen wallet; the pooled methods of other
 * countries always see every wallet.
 */
import { describe, it, expect } from "vitest";
import { compareAllMethods } from "../optimizer";
import { simulateSale } from "../simulator";
import { WALLET_BY_WALLET_METHODS } from "../wallet-methods";
import type { TaxLot } from "../types";

const lots: TaxLot[] = [
  {
    id: "w1-a",
    asset: "BTC",
    amount: 1,
    costBasisUsd: 10000,
    acquiredAt: new Date("2023-01-01T00:00:00Z"),
    sourceId: "w1",
  },
  {
    id: "w2-a",
    asset: "BTC",
    amount: 3,
    costBasisUsd: 90000,
    acquiredAt: new Date("2024-01-01T00:00:00Z"),
    sourceId: "w2",
  },
];
const input = { asset: "BTC", amount: 1, pricePerUnit: 60000 };

describe("compareAllMethods in wallet mode", () => {
  const silo = compareAllMethods(lots, {
    ...input,
    strictSilo: true,
    sourceId: "w2",
  });
  const pooled = compareAllMethods(lots, input);

  it("FIFO uses only the chosen wallet", () => {
    // w2 holds only the 30000-per-unit lot; pooled FIFO would use the 10000 lot.
    expect(silo.methods.FIFO.costBasis).toBeCloseTo(30000, 2);
    expect(pooled.methods.FIFO.costBasis).toBeCloseTo(10000, 2);
  });

  it("LIFO and HIFO use only the chosen wallet too", () => {
    expect(silo.methods.LIFO.costBasis).toBeCloseTo(30000, 2);
    expect(silo.methods.HIFO.costBasis).toBeCloseTo(30000, 2);
  });

  it("a pooled method ignores the wallet", () => {
    // Germany FIFO is a pooled national rule: it still starts from the oldest lot.
    expect(silo.methods.GERMANY_FIFO.costBasis).toBeCloseTo(
      pooled.methods.GERMANY_FIFO.costBasis,
      2,
    );
    expect(silo.methods.GERMANY_FIFO.costBasis).toBeCloseTo(10000, 2);
  });

  // Negative control: handing strictSilo straight to the simulator for a
  // pooled method would shrink it to one wallet, which is what must NOT happen.
  it("negative control: forcing the wallet on a pooled method would change it", () => {
    const forced = simulateSale(lots, {
      ...input,
      method: "GERMANY_FIFO",
      strictSilo: true,
      sourceId: "w2",
    });
    expect(forced.costBasis).not.toBeCloseTo(10000, 2);
  });
});

describe("compareAllMethods: pooled methods start from pooled holdings", () => {
  // wallet-by-wallet holdings still contain the cheap lot that a sale booked in
  // another wallet used up in the pooled worked-out holdings
  const walletLots: TaxLot[] = [lots[0], lots[1]];
  const pooledLots: TaxLot[] = [lots[1]];

  it("gives FIFO the wallet lots and Germany FIFO the pooled ones", () => {
    const r = compareAllMethods(
      walletLots,
      { ...input, strictSilo: true, sourceId: "w2" },
      undefined,
      pooledLots,
    );
    expect(r.methods.FIFO.costBasis).toBeCloseTo(30000, 2);
    expect(r.methods.GERMANY_FIFO.costBasis).toBeCloseTo(30000, 2);
  });

  it("negative control: without pooledLots Germany FIFO would use the used-up cheap lot", () => {
    const r = compareAllMethods(walletLots, {
      ...input,
      strictSilo: true,
      sourceId: "w2",
    });
    expect(r.methods.GERMANY_FIFO.costBasis).toBeCloseTo(10000, 2);
  });
});

describe("WALLET_BY_WALLET_METHODS", () => {
  it("is exactly the methods the US rules apply wallet by wallet", () => {
    expect([...WALLET_BY_WALLET_METHODS].sort()).toEqual([
      "FIFO",
      "HIFO",
      "LIFO",
      "SPECIFIC_ID",
    ]);
  });
});
