/**
 * Tax Impact Simulator tests.
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { simulateSale } from "../simulator";
import type { SimulationInput } from "../simulator";
import type { TaxLot } from "../types";
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

describe("simulateSale", () => {
  it("computes a gain when proceeds exceed cost basis", () => {
    const lots = [makeLot("L1", "BTC", 1, 30000, "2024-01-01")];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.projectedGainLoss).toBe(20000);
    expect(result.proceeds).toBe(50000);
    expect(result.costBasis).toBe(30000);
    expect(result.insufficientLots).toBe(false);
  });

  it("computes a loss when proceeds are below cost basis", () => {
    const lots = [makeLot("L1", "ETH", 2, 2000, "2024-06-01")];
    const input: SimulationInput = {
      asset: "ETH",
      amount: 2,
      pricePerUnit: 1500,
      date: new Date("2025-01-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.projectedGainLoss).toBe(-1000);
    expect(result.proceeds).toBe(3000);
    expect(result.costBasis).toBe(4000);
  });

  it("classifies short-term holding period (< 1 year)", () => {
    const lots = [makeLot("L1", "BTC", 1, 40000, "2025-01-01")];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.holdingPeriod).toBe("SHORT_TERM");
    expect(result.matchedLots[0].holdingPeriod).toBe("SHORT_TERM");
  });

  it("classifies long-term holding period (>= 1 year)", () => {
    const lots = [makeLot("L1", "BTC", 1, 20000, "2023-01-01")];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.holdingPeriod).toBe("LONG_TERM");
    expect(result.matchedLots[0].holdingPeriod).toBe("LONG_TERM");
  });

  it("detects mixed holding period when lots span > 1 year boundary", () => {
    const lots = [
      makeLot("L1", "BTC", 0.5, 30000, "2023-01-01"), // long-term
      makeLot("L2", "BTC", 0.5, 40000, "2025-03-01"), // short-term
    ];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.holdingPeriod).toBe("MIXED");
    expect(result.shortTermGainLoss).not.toBe(0);
    expect(result.longTermGainLoss).not.toBe(0);
  });

  it("returns different results for FIFO vs LIFO on the same lots", () => {
    const lots = [
      makeLot("L1", "BTC", 1, 20000, "2024-01-01"), // cheap, early
      makeLot("L2", "BTC", 1, 50000, "2024-06-01"), // expensive, late
    ];
    const baseInput: Omit<SimulationInput, "method"> = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 40000,
      date: new Date("2025-06-01"),
    };

    const fifo = simulateSale(lots, { ...baseInput, method: "FIFO" });
    const lifo = simulateSale(lots, { ...baseInput, method: "LIFO" });

    // FIFO uses L1 (cost 20k) → gain 20k; LIFO uses L2 (cost 50k) → loss 10k
    expect(fifo.projectedGainLoss).toBe(20000);
    expect(lifo.projectedGainLoss).toBe(-10000);
    expect(fifo.matchedLots[0].lotId).toBe("L1");
    expect(lifo.matchedLots[0].lotId).toBe("L2");
  });

  it("handles partial sale (does not consume all lots)", () => {
    const lots = [
      makeLot("L1", "ETH", 5, 1000, "2024-01-01"),
      makeLot("L2", "ETH", 3, 1200, "2024-03-01"),
    ];
    const input: SimulationInput = {
      asset: "ETH",
      amount: 2,
      pricePerUnit: 1500,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.matchedLots).toHaveLength(1);
    expect(result.matchedLots[0].amount).toBe(2);
    expect(result.remainingPosition.totalAmount).toBeCloseTo(6, 5);
    expect(result.insufficientLots).toBe(false);
  });

  it("handles full sale (consume all lots, remaining = 0)", () => {
    const lots = [makeLot("L1", "SOL", 10, 100, "2024-01-01")];
    const input: SimulationInput = {
      asset: "SOL",
      amount: 10,
      pricePerUnit: 150,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.remainingPosition.totalAmount).toBeCloseTo(0, 5);
    expect(result.remainingPosition.totalCostBasis).toBeCloseTo(0, 2);
    expect(result.remainingPosition.avgCostPerUnit).toBe(0);
    expect(result.insufficientLots).toBe(false);
  });

  it("sets insufficientLots when requested amount exceeds available", () => {
    const lots = [makeLot("L1", "BTC", 0.5, 30000, "2024-01-01")];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 2,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.insufficientLots).toBe(true);
    expect(result.availableAmount).toBe(0.5);
    // Should use available amount for proceeds calculation
    expect(result.proceeds).toBe(0.5 * 50000);
  });

  it("does NOT mutate the original lots", () => {
    const lots = [makeLot("L1", "BTC", 1, 30000, "2024-01-01")];
    const originalAmount = lots[0].amount;
    const originalCostBasis = lots[0].costBasisUsd;

    simulateSale(lots, {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000,
      date: new Date("2025-06-01"),
    });

    expect(lots[0].amount).toBe(originalAmount);
    expect(lots[0].costBasisUsd).toBe(originalCostBasis);
  });

  it("computes remainingPosition correctly after partial sale", () => {
    const lots = [
      makeLot("L1", "ETH", 3, 1000, "2024-01-01"), // total cost = 3000
      makeLot("L2", "ETH", 2, 1500, "2024-06-01"), // total cost = 3000
    ];
    const input: SimulationInput = {
      asset: "ETH",
      amount: 3,
      pricePerUnit: 2000,
      date: new Date("2025-06-01"),
      method: "FIFO",
    };
    const result = simulateSale(lots, input);

    // FIFO: consume all of L1 (3 ETH) → L2 remains (2 ETH, $3000)
    expect(result.remainingPosition.totalAmount).toBeCloseTo(2, 5);
    expect(result.remainingPosition.totalCostBasis).toBeCloseTo(3000, 2);
    expect(result.remainingPosition.avgCostPerUnit).toBeCloseTo(1500, 2);
  });

  it("detects wash sale risk when acquisitions are provided", () => {
    // Sell at a loss, with a recent acquisition of the same asset
    const lots = [makeLot("L1", "BTC", 1, 50000, "2024-01-01")];
    const acquisitions: AcquisitionRecord[] = [
      {
        lotId: "L-replacement",
        asset: "BTC",
        amount: 1,
        acquiredAt: new Date("2025-05-25"), // within 30 days of sale
      },
    ];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 40000, // loss of 10000
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input, acquisitions);

    expect(result.projectedGainLoss).toBe(-10000);
    expect(result.washSaleRisk).toBe(true);
    expect(result.washSaleDisallowed).toBeGreaterThan(0);
  });

  it("reports no wash sale risk when no acquisitions are provided", () => {
    const lots = [makeLot("L1", "BTC", 1, 50000, "2024-01-01")];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 40000,
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input);

    expect(result.washSaleRisk).toBe(false);
    expect(result.washSaleDisallowed).toBe(0);
  });

  it("reports no wash sale risk on a gain even with acquisitions", () => {
    const lots = [makeLot("L1", "BTC", 1, 30000, "2024-01-01")];
    const acquisitions: AcquisitionRecord[] = [
      {
        lotId: "L-new",
        asset: "BTC",
        amount: 1,
        acquiredAt: new Date("2025-05-25"),
      },
    ];
    const input: SimulationInput = {
      asset: "BTC",
      amount: 1,
      pricePerUnit: 50000, // gain
      date: new Date("2025-06-01"),
    };
    const result = simulateSale(lots, input, acquisitions);

    expect(result.washSaleRisk).toBe(false);
    expect(result.washSaleDisallowed).toBe(0);
  });
});
