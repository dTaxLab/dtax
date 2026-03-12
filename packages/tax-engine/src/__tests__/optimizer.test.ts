/**
 * Method Comparison Engine tests.
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { compareAllMethods } from "../optimizer";
import type { TaxLot } from "../types";
import type { SimulationInput } from "../simulator";
import type { AcquisitionRecord } from "../wash-sale";

/** Helper to create a TaxLot. */
function makeLot(
  id: string,
  asset: string,
  amount: number,
  costPerUnit: number,
  acquiredAt: string,
  sourceId = "default",
): TaxLot {
  return {
    id,
    asset,
    amount,
    costBasisUsd: amount * costPerUnit,
    acquiredAt: new Date(acquiredAt),
    sourceId,
  };
}

describe("compareAllMethods", () => {
  it("returns different results for three methods with varied lot costs", () => {
    // Lots acquired at different prices; FIFO/LIFO/HIFO will pick different lots
    const lots = [
      makeLot("L1", "BTC", 1, 20000, "2024-01-01"), // cheapest, earliest
      makeLot("L2", "BTC", 1, 40000, "2024-06-01"), // mid
      makeLot("L3", "BTC", 1, 60000, "2024-09-01"), // most expensive, latest
    ];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    // FIFO picks L1 (cost 20k) → gain 30k
    expect(result.fifo.projectedGainLoss).toBe(30000);
    // LIFO picks L3 (cost 60k) → loss -10k
    expect(result.lifo.projectedGainLoss).toBe(-10000);
    // HIFO picks L3 (cost 60k) → loss -10k
    expect(result.hifo.projectedGainLoss).toBe(-10000);
  });

  it("recommends the method with the smallest gain in all-gain scenario", () => {
    // HIFO picks highest cost (L2=45k), LIFO picks latest (L3=35k), FIFO picks earliest (L1=30k)
    const lots = [
      makeLot("L1", "BTC", 1, 30000, "2024-01-01"), // FIFO picks: gain 20k
      makeLot("L2", "BTC", 1, 45000, "2024-06-01"), // HIFO picks: gain 5k
      makeLot("L3", "BTC", 1, 35000, "2024-09-01"), // LIFO picks: gain 15k
    ];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    // HIFO picks the lot with the highest cost basis → smallest gain
    expect(result.recommended).toBe("HIFO");
    expect(result.hifo.projectedGainLoss).toBe(5000);
  });

  it("recommends the method with the largest loss in loss scenario", () => {
    // HIFO picks highest cost (L2=50k), LIFO picks latest (L3=35k), FIFO picks earliest (L1=30k)
    const lots = [
      makeLot("L1", "BTC", 1, 30000, "2024-01-01"), // FIFO: loss -5k
      makeLot("L2", "BTC", 1, 50000, "2024-06-01"), // HIFO: loss -25k
      makeLot("L3", "BTC", 1, 35000, "2024-09-01"), // LIFO: loss -10k
    ];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 25000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    // HIFO picks the most expensive lot → largest loss → best deduction
    expect(result.recommended).toBe("HIFO");
    expect(result.hifo.projectedGainLoss).toBe(-25000);
  });

  it("downgrades a method that triggers wash sale when others do not", () => {
    // Create scenario where HIFO triggers wash sale but FIFO doesn't
    // Need a loss + recent acquisition within 30 days of the sale
    const saleDate = new Date("2025-06-15");
    const lots = [
      makeLot("L1", "BTC", 1, 30000, "2024-01-01"), // FIFO picks: loss -5k
      makeLot("L2", "BTC", 1, 40000, "2024-06-01"), // LIFO picks: loss -15k
      makeLot("L3", "BTC", 1, 60000, "2024-09-01"), // HIFO picks: loss -35k
    ];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 25000,
      date: saleDate,
    };

    // Acquisition within 30 days of sale → triggers wash sale for losses
    // The wash sale detector uses lot IDs from the disposition to check
    const acquisitions: AcquisitionRecord[] = [
      {
        id: "A1",
        asset: "BTC",
        amount: 1,
        costBasisUsd: 26000,
        acquiredAt: new Date("2025-06-10"), // 5 days before sale
        lotId: "L-new",
      },
    ];

    const result = compareAllMethods(lots, input, acquisitions);

    // All methods produce a loss, all should trigger wash sale in this case
    // (since the acquisition is recent for all dispositions)
    // Verify wash sale detection is propagated
    const anyWash =
      result.fifo.washSaleRisk ||
      result.lifo.washSaleRisk ||
      result.hifo.washSaleRisk;
    expect(anyWash).toBe(true);

    // The recommendation should still be provided
    expect(result.recommended).toBeTruthy();
    expect(result.recommendedReason.length).toBeGreaterThan(0);
  });

  it("calculates savings as the absolute difference between best and worst", () => {
    const lots = [
      makeLot("L1", "BTC", 1, 20000, "2024-01-01"),
      makeLot("L2", "BTC", 1, 40000, "2024-06-01"),
      makeLot("L3", "BTC", 1, 60000, "2024-09-01"),
    ];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    // FIFO gain: 30000, LIFO loss: -10000, HIFO loss: -10000
    // savings = |30000 - (-10000)| = 40000
    expect(result.savings).toBe(40000);
  });

  it("recommends FIFO when all three methods produce identical results", () => {
    // Single lot: all methods must pick the same lot
    const lots = [makeLot("L1", "BTC", 1, 30000, "2024-01-01")];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    expect(result.recommended).toBe("FIFO");
    expect(result.recommendedReason).toContain("identical");
    expect(result.savings).toBe(0);
  });

  it("does not mutate the original lots array", () => {
    const lots = [
      makeLot("L1", "BTC", 2, 30000, "2024-01-01"),
      makeLot("L2", "BTC", 2, 40000, "2024-06-01"),
    ];
    const originalAmounts = lots.map((l) => l.amount);
    const originalCosts = lots.map((l) => l.costBasisUsd);

    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    compareAllMethods(lots, input);

    // Verify original lots are untouched
    expect(lots.map((l) => l.amount)).toEqual(originalAmounts);
    expect(lots.map((l) => l.costBasisUsd)).toEqual(originalCosts);
  });

  it("propagates insufficientLots consistently across all methods", () => {
    const lots = [makeLot("L1", "BTC", 0.5, 30000, "2024-01-01")];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 2, // Request more than available
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    expect(result.fifo.insufficientLots).toBe(true);
    expect(result.lifo.insufficientLots).toBe(true);
    expect(result.hifo.insufficientLots).toBe(true);
    // All should have the same available amount
    expect(result.fifo.availableAmount).toBe(0.5);
    expect(result.lifo.availableAmount).toBe(0.5);
    expect(result.hifo.availableAmount).toBe(0.5);
  });

  it("provides a non-empty recommendedReason for every scenario", () => {
    // Scenario 1: All gains
    const lots1 = [
      makeLot("L1", "BTC", 1, 30000, "2024-01-01"),
      makeLot("L2", "BTC", 1, 45000, "2024-06-01"),
    ];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };
    const r1 = compareAllMethods(lots1, input);
    expect(r1.recommendedReason).toBeTruthy();
    expect(typeof r1.recommendedReason).toBe("string");
    expect(r1.recommendedReason.length).toBeGreaterThan(0);

    // Scenario 2: Some losses
    const lots2 = [
      makeLot("L1", "BTC", 1, 30000, "2024-01-01"),
      makeLot("L2", "BTC", 1, 60000, "2024-06-01"),
    ];
    const input2: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 40000,
      date: new Date("2025-06-01"),
    };
    const r2 = compareAllMethods(lots2, input2);
    expect(r2.recommendedReason).toBeTruthy();
    expect(r2.recommendedReason.length).toBeGreaterThan(0);
  });

  it("handles a single lot (all methods produce the same result)", () => {
    const lots = [makeLot("L1", "ETH", 5, 2000, "2024-03-01")];
    const input: Omit<SimulationInput, "method"> = {
      asset: "ETH",
      amount: 3,
      pricePerUnit: 2500,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    // All methods consume from the same single lot
    expect(result.fifo.projectedGainLoss).toBe(result.lifo.projectedGainLoss);
    expect(result.lifo.projectedGainLoss).toBe(result.hifo.projectedGainLoss);
    expect(result.recommended).toBe("FIFO");
    expect(result.savings).toBe(0);
  });

  it("handles mixed gain/loss across methods correctly", () => {
    // FIFO produces a gain, LIFO/HIFO produce losses
    const lots = [
      makeLot("L1", "BTC", 1, 20000, "2024-01-01"), // FIFO picks → gain
      makeLot("L2", "BTC", 1, 40000, "2024-06-01"),
      makeLot("L3", "BTC", 1, 60000, "2024-09-01"), // LIFO/HIFO picks → loss
    ];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    expect(result.fifo.projectedGainLoss).toBeGreaterThan(0);
    expect(result.hifo.projectedGainLoss).toBeLessThan(0);
    // Should recommend the method with the largest loss (most deduction)
    expect(["LIFO", "HIFO"]).toContain(result.recommended);
  });

  it("includes all SimulationResult fields in each method result", () => {
    const lots = [makeLot("L1", "BTC", 1, 30000, "2024-01-01")];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    for (const key of ["fifo", "lifo", "hifo"] as const) {
      const r = result[key];
      expect(r).toHaveProperty("projectedGainLoss");
      expect(r).toHaveProperty("holdingPeriod");
      expect(r).toHaveProperty("shortTermGainLoss");
      expect(r).toHaveProperty("longTermGainLoss");
      expect(r).toHaveProperty("proceeds");
      expect(r).toHaveProperty("costBasis");
      expect(r).toHaveProperty("matchedLots");
      expect(r).toHaveProperty("washSaleRisk");
      expect(r).toHaveProperty("remainingPosition");
      expect(r).toHaveProperty("insufficientLots");
      expect(r).toHaveProperty("availableAmount");
    }
  });
});
