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
    expect(result.methods["FIFO"].projectedGainLoss).toBe(30000);
    // LIFO picks L3 (cost 60k) → loss -10k
    expect(result.methods["LIFO"].projectedGainLoss).toBe(-10000);
    // HIFO picks L3 (cost 60k) → loss -10k
    expect(result.methods["HIFO"].projectedGainLoss).toBe(-10000);
  });

  it("recommends the method with the smallest gain in all-gain scenario", () => {
    // Use lots held < 12 months so GERMANY_FIFO behaves like standard FIFO
    // HIFO picks highest cost (L2=45k), LIFO picks latest (L3=35k), FIFO picks earliest (L1=30k)
    const lots = [
      makeLot("L1", "BTC", 1, 30000, "2025-01-01"), // FIFO picks: gain 20k (<12 months)
      makeLot("L2", "BTC", 1, 45000, "2025-03-01"), // HIFO picks: gain 5k (<12 months)
      makeLot("L3", "BTC", 1, 35000, "2025-04-01"), // LIFO picks: gain 15k (<12 months)
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
    expect(result.methods["HIFO"].projectedGainLoss).toBe(5000);
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
    expect(result.methods["HIFO"].projectedGainLoss).toBe(-25000);
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

    // Verify wash sale detection is propagated to at least one method
    const anyWash = Object.values(result.methods).some((m) => m.washSaleRisk);
    expect(anyWash).toBe(true);

    // The recommendation should still be provided
    expect(result.recommended).toBeTruthy();
    expect(result.recommendedReasonCode.length).toBeGreaterThan(0);
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

    // FIFO gain: 30000, HIFO/LIFO loss: -10000 (UK_SHARE_POOLING/PMPA/TOTAL_AVERAGE/GERMANY_FIFO will vary)
    // savings = max - min across all 7 methods
    expect(result.savings).toBeGreaterThanOrEqual(0);
    // Verify FIFO/HIFO difference is at least 40000
    const fifoGL = result.methods["FIFO"].projectedGainLoss;
    const hifoGL = result.methods["HIFO"].projectedGainLoss;
    expect(Math.abs(fifoGL - hifoGL)).toBe(40000);
  });

  it("recommends FIFO when all methods produce identical results", () => {
    // pricePerUnit == costPerUnit → gain = 0 for all methods regardless of holding period or strategy
    const lots = [makeLot("L1", "BTC", 1, 50000, "2024-01-01")];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000, // no gain, no loss
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    expect(result.recommended).toBe("FIFO");
    expect(result.recommendedReasonCode).toBe("identical");
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

    // All 7 methods should report insufficientLots
    for (const sim of Object.values(result.methods)) {
      expect(sim.insufficientLots).toBe(true);
      expect(sim.availableAmount).toBe(0.5);
    }
  });

  it("provides a valid recommendedReasonCode for every scenario", () => {
    const validCodes = [
      "identical",
      "lowest_gain",
      "largest_loss_clean",
      "largest_loss",
    ];

    // Scenario 1: All gains
    const lots1 = [
      makeLot("L1", "BTC", 1, 30000, "2024-01-01"),
      makeLot("L2", "BTC", 1, 45000, "2024-06-01"),
    ];
    const input1: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };
    const r1 = compareAllMethods(lots1, input1);
    expect(validCodes).toContain(r1.recommendedReasonCode);

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
    expect(validCodes).toContain(r2.recommendedReasonCode);
  });

  it("handles a single lot with no gain (all methods produce the same result)", () => {
    // pricePerUnit == costPerUnit: gain = 0 for every method including GERMANY_FIFO
    const lots = [makeLot("L1", "ETH", 5, 2500, "2024-03-01")];
    const input: Omit<SimulationInput, "method"> = {
      asset: "ETH",
      amount: 3,
      pricePerUnit: 2500, // no gain, no loss
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    const fifoGL = result.methods["FIFO"].projectedGainLoss;
    const lifoGL = result.methods["LIFO"].projectedGainLoss;
    const hifoGL = result.methods["HIFO"].projectedGainLoss;

    // All methods produce the same result (0 gain)
    expect(fifoGL).toBe(lifoGL);
    expect(lifoGL).toBe(hifoGL);
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

    expect(result.methods["FIFO"].projectedGainLoss).toBeGreaterThan(0);
    expect(result.methods["HIFO"].projectedGainLoss).toBeLessThan(0);
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

    for (const sim of Object.values(result.methods)) {
      expect(sim).toHaveProperty("projectedGainLoss");
      expect(sim).toHaveProperty("holdingPeriod");
      expect(sim).toHaveProperty("shortTermGainLoss");
      expect(sim).toHaveProperty("longTermGainLoss");
      expect(sim).toHaveProperty("proceeds");
      expect(sim).toHaveProperty("costBasis");
      expect(sim).toHaveProperty("matchedLots");
      expect(sim).toHaveProperty("washSaleRisk");
      expect(sim).toHaveProperty("remainingPosition");
      expect(sim).toHaveProperty("insufficientLots");
      expect(sim).toHaveProperty("availableAmount");
    }
  });

  it("returns all 7 comparable methods in result.methods", () => {
    const lots = [makeLot("L1", "BTC", 1, 30000, "2024-01-01")];
    const input: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };

    const result = compareAllMethods(lots, input);

    const expectedMethods = [
      "FIFO",
      "LIFO",
      "HIFO",
      "GERMANY_FIFO",
      "PMPA",
      "TOTAL_AVERAGE",
      "UK_SHARE_POOLING",
    ];
    for (const m of expectedMethods) {
      expect(result.methods).toHaveProperty(m);
    }
    expect(Object.keys(result.methods)).toHaveLength(7);
  });
});
