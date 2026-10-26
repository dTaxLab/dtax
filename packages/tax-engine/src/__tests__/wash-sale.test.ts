/**
 * Wash Sale Detection Tests
 *
 * IRS wash sale rule (IRC §1091):
 * - Sell at a loss + repurchase within 30 days before/after = loss disallowed
 * - Disallowed loss added to replacement lot's cost basis
 * - Form 8949 adjustment code W
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { detectWashSales, AcquisitionRecord } from "../wash-sale";
import { CostBasisCalculator } from "../calculator";
import { generateForm8949 } from "../reports/form8949";
import type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  LotDateMap,
} from "../types";

describe("Wash Sale Detection", () => {
  // ─── Basic wash sale detection ─────────

  describe("basic detection", () => {
    it("should detect wash sale when repurchase is within 30 days after sale", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      // Sell BTC at a loss
      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 40000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      expect(result.gainLoss).toBe(-10000);

      // Repurchase within 30 days
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-03-15"), // 14 days after sale
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]), // lot-1 was consumed by the sale
      );

      expect(washResult.adjustments).toHaveLength(1);
      expect(washResult.adjustments[0].disallowedLoss).toBe(10000);
      expect(washResult.adjustments[0].replacementLotId).toBe("lot-2");
      expect(washResult.adjustments[0].fullDisallowance).toBe(true);
      expect(washResult.totalDisallowed).toBe(10000);
    });

    it("should detect wash sale when repurchase is within 30 days before sale", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "ETH",
          amount: 5,
          costBasisUsd: 15000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "ETH",
        amount: 5,
        proceedsUsd: 10000,
        date: new Date("2025-04-15"),
        sourceId: "w1",
      });

      expect(result.gainLoss).toBe(-5000);

      // Bought 20 days BEFORE the sale
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-pre",
          asset: "ETH",
          amount: 5,
          acquiredAt: new Date("2025-03-26"), // 20 days before sale
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );

      expect(washResult.adjustments).toHaveLength(1);
      expect(washResult.adjustments[0].disallowedLoss).toBe(5000);
    });
  });

  // ─── No wash sale scenarios ─────────

  describe("no wash sale", () => {
    it("should not flag wash sale when repurchase is outside 30-day window", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 40000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      // Repurchase 45 days later (outside window)
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-04-15"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );
      expect(washResult.adjustments).toHaveLength(0);
      expect(washResult.totalDisallowed).toBe(0);
    });

    it("should not flag wash sale for gains (only losses trigger wash sale)", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 30000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 50000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      expect(result.gainLoss).toBe(20000); // Gain, not loss

      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-03-10"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );
      expect(washResult.adjustments).toHaveLength(0);
    });

    it("should not flag wash sale when repurchase is a different asset", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 40000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      // Bought ETH, not BTC
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "ETH",
          amount: 10,
          acquiredAt: new Date("2025-03-10"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );
      expect(washResult.adjustments).toHaveLength(0);
    });
  });

  // ─── Partial wash sale ─────────

  describe("partial wash sale", () => {
    it("should calculate partial disallowance when replacement amount is less than sold", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "ETH",
          amount: 10,
          costBasisUsd: 30000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      // Sell 10 ETH at a loss of $10,000
      const result = calc.calculate({
        id: "sell-1",
        asset: "ETH",
        amount: 10,
        proceedsUsd: 20000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      expect(result.gainLoss).toBe(-10000);

      // Only repurchase 4 ETH within window
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "ETH",
          amount: 4,
          acquiredAt: new Date("2025-03-10"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );

      expect(washResult.adjustments).toHaveLength(1);
      // Loss per unit: $10,000 / 10 = $1,000
      // Disallowed: 4 × $1,000 = $4,000
      expect(washResult.adjustments[0].disallowedLoss).toBe(4000);
      expect(washResult.adjustments[0].fullDisallowance).toBe(false);
    });
  });

  // ─── Multiple wash sales ─────────

  describe("multiple wash sales", () => {
    it("should detect multiple independent wash sales", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "btc-lot",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
        {
          id: "eth-lot",
          asset: "ETH",
          amount: 10,
          costBasisUsd: 30000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
      ]);

      const btcSell = calc.calculate({
        id: "btc-sell",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 45000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });
      const ethSell = calc.calculate({
        id: "eth-sell",
        asset: "ETH",
        amount: 10,
        proceedsUsd: 25000,
        date: new Date("2025-04-01"),
        sourceId: "w1",
      });

      expect(btcSell.gainLoss).toBe(-5000);
      expect(ethSell.gainLoss).toBe(-5000);

      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "btc-repurchase",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-03-20"),
        },
        {
          lotId: "eth-repurchase",
          asset: "ETH",
          amount: 10,
          acquiredAt: new Date("2025-04-15"),
        },
      ];

      const washResult = detectWashSales(
        [btcSell, ethSell],
        acquisitions,
        new Set(["btc-lot", "eth-lot"]),
      );

      expect(washResult.adjustments).toHaveLength(2);
      expect(washResult.totalDisallowed).toBe(10000);
    });

    it("should not reuse a replacement lot for multiple wash sales", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
        {
          id: "lot-2",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 48000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      const sell1 = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 45000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });
      const sell2 = calc.calculate({
        id: "sell-2",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 44000,
        date: new Date("2025-03-05"),
        sourceId: "w1",
      });

      // Only one replacement lot available
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "replacement",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-03-10"),
        },
      ];

      const washResult = detectWashSales(
        [sell1, sell2],
        acquisitions,
        new Set(["lot-1", "lot-2"]),
      );

      // Only one wash sale should be flagged (first loss event gets the replacement)
      expect(washResult.adjustments).toHaveLength(1);
      expect(washResult.adjustments[0].lossEventId).toBe("sell-1");
    });
  });

  // ─── Adjusted results ─────────

  describe("adjusted results", () => {
    it("should adjust gainLoss in results by adding back disallowed loss", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 40000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-03-15"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );

      // Original: -10000, disallowed: 10000 → adjusted: 0
      expect(washResult.adjustedResults[0].gainLoss).toBe(0);
    });

    it("should leave non-wash-sale results unchanged", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 30000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
        {
          id: "lot-2",
          asset: "ETH",
          amount: 5,
          costBasisUsd: 10000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
      ]);

      const btcGain = calc.calculate({
        id: "btc-sell",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 50000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });
      const ethLoss = calc.calculate({
        id: "eth-sell",
        asset: "ETH",
        amount: 5,
        proceedsUsd: 8000,
        date: new Date("2025-04-01"),
        sourceId: "w1",
      });

      // No replacement for ETH
      const washResult = detectWashSales(
        [btcGain, ethLoss],
        [], // No acquisitions
        new Set(["lot-1", "lot-2"]),
      );

      // Both results unchanged
      expect(washResult.adjustedResults[0].gainLoss).toBe(20000);
      expect(washResult.adjustedResults[1].gainLoss).toBe(-2000);
    });
  });

  // ─── Form 8949 integration ─────────

  describe("Form 8949 with wash sale", () => {
    it("should generate Form 8949 with adjustment code W", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 40000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
        feeUsd: 50,
      });

      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-03-15"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );

      // Build wash sale map for Form 8949
      const washMap = new Map(
        washResult.adjustments.map((a) => [a.lossEventId, a]),
      );

      const lotDates: LotDateMap = new Map([["lot-1", new Date("2024-06-01")]]);

      const report = generateForm8949([result], {
        taxYear: 2025,
        lotDates,
        reportingBasis: "none",
        washSaleAdjustments: washMap,
      });

      expect(report.lines).toHaveLength(1);
      const line = report.lines[0];

      // TAX-12: fee "E" code removed; only wash sale "W" remains
      expect(line.adjustmentCode).toBe("W");
      // Wash sale disallowed amount = 10050 (full loss)
      expect(line.adjustmentAmount).toBe(10050);
      // Original gainLoss was -10050 (proceeds 40000 - basis 50000 - fee 50)
      // After wash sale: -10050 + 10050 = 0 (entire loss disallowed)
      expect(line.gainLoss).toBe(0);
    });

    it("should show only W code when no fees", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "ETH",
          amount: 5,
          costBasisUsd: 15000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "ETH",
        amount: 5,
        proceedsUsd: 12000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      const washResult = detectWashSales(
        [result],
        [
          {
            lotId: "lot-2",
            asset: "ETH",
            amount: 5,
            acquiredAt: new Date("2025-03-20"),
          },
        ],
        new Set(["lot-1"]),
      );

      const washMap = new Map(
        washResult.adjustments.map((a) => [a.lossEventId, a]),
      );

      const report = generateForm8949([result], {
        taxYear: 2025,
        reportingBasis: "none",
        washSaleAdjustments: washMap,
      });

      const line = report.lines[0];
      expect(line.adjustmentCode).toBe("W");
      expect(line.adjustmentAmount).toBe(3000);
      expect(line.gainLoss).toBe(0); // Loss fully disallowed
    });
  });

  // ─── Edge cases ─────────

  describe("edge cases", () => {
    it("should handle exactly 30 days (boundary)", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 45000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      // Exactly 30 days later (should still be within window)
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-03-31"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );
      expect(washResult.adjustments).toHaveLength(1);
    });

    it("should handle 31 days (just outside window)", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 45000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      // 31 days later
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-2",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2025-04-01"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]),
      );
      expect(washResult.adjustments).toHaveLength(0);
    });

    it("should handle empty inputs", () => {
      const washResult = detectWashSales([], [], new Set());
      expect(washResult.adjustments).toHaveLength(0);
      expect(washResult.totalDisallowed).toBe(0);
      expect(washResult.adjustedResults).toHaveLength(0);
    });

    it("should not match sold lot as its own replacement", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "lot-1",
          asset: "BTC",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "w1",
        },
      ]);

      const result = calc.calculate({
        id: "sell-1",
        asset: "BTC",
        amount: 1,
        proceedsUsd: 40000,
        date: new Date("2025-03-01"),
        sourceId: "w1",
      });

      // The only acquisition is lot-1 itself (which was consumed)
      const acquisitions: AcquisitionRecord[] = [
        {
          lotId: "lot-1",
          asset: "BTC",
          amount: 1,
          acquiredAt: new Date("2024-01-01"),
        },
      ];

      const washResult = detectWashSales(
        [result],
        acquisitions,
        new Set(["lot-1"]), // lot-1 was consumed
      );

      expect(washResult.adjustments).toHaveLength(0);
    });
  });
});

describe("computeWashSaleCarryover", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const loss = (
    id: string,
    amount: number,
    gain: number,
    day: string,
    lots: string[],
  ) => ({
    event: {
      id,
      asset: "BTC",
      amount,
      proceedsUsd: 0,
      date: d(day),
      sourceId: "s",
    },
    matchedLots: lots.map((l) => ({
      lotId: l,
      amountConsumed: amount,
      costBasisUsd: 0,
      fullyConsumed: true,
    })),
    gainLoss: gain,
    holdingPeriod: "SHORT_TERM" as const,
    method: "FIFO",
  });
  const acq = (id: string, amount: number, day: string) => ({
    lotId: id,
    asset: "BTC",
    amount,
    acquiredAt: d(day),
  });

  it("spreads one loss over the replacement quantity and caps at the loss quantity", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover(
      [loss("L", 4, -400, "2024-12-20", ["old"])],
      [
        acq("old", 4, "2024-01-01"),
        acq("r1", 3, "2025-01-05"),
        acq("r2", 5, "2025-01-10"),
      ],
    );
    expect(out.extraCost.get("r1")).toBe(300); // 3 units x 100
    expect(out.extraCost.get("r2")).toBe(100); // the remaining 1 unit
    expect(out.usedQuantity.get("r2")).toBe(1);
    expect(out.extraCost.has("old")).toBe(false); // the sold lot is never its own replacement
  });

  it("a replacement lot serves a second loss with the quantity left", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover(
      [
        loss("L1", 1, -50, "2024-12-10", ["a"]),
        loss("L2", 1, -50, "2024-12-12", ["b"]),
      ],
      [
        acq("a", 1, "2024-01-01"),
        acq("b", 1, "2024-01-02"),
        acq("r", 10, "2024-12-20"),
      ],
    );
    expect(out.extraCost.get("r")).toBe(100); // both losses, not only the first
  });

  it("lots consumed by other sales stay available as replacements", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover(
      [
        loss("L", 1, -400, "2024-12-20", ["old"]),
        loss("OTHER", 1, 10, "2025-06-01", ["r"]),
      ].filter((x) => x.gainLoss < 0),
      [acq("old", 1, "2024-01-01"), acq("r", 1, "2025-01-05")],
    );
    expect(out.extraCost.get("r")).toBe(400);
  });

  // Negative control: outside the 30-day window nothing is carried.
  it("carries nothing when the purchase is more than 30 days away", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover(
      [loss("L", 1, -400, "2024-12-20", ["old"])],
      [acq("old", 1, "2024-01-01"), acq("far", 1, "2025-01-25")],
    );
    expect(out.extraCost.size).toBe(0);
  });

  it("a purchase up to 30 days before the sale counts too", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover(
      [loss("L", 1, -400, "2024-12-20", ["old"])],
      [acq("old", 1, "2024-01-01"), acq("before", 1, "2024-11-25")],
    );
    expect(out.extraCost.get("before")).toBe(400);
  });

  it("a replacement lot already touched by a sale is not used (the cost would land on sold units)", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover(
      [loss("L", 1, -400, "2024-12-20", ["old"])],
      [acq("old", 1, "2024-01-01"), acq("r", 10, "2025-01-05")],
      { touchedLotIds: new Set(["r"]) },
    );
    expect(out.extraCost.size).toBe(0);
  });

  it("sub-cent losses use up no replacement quantity", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover(
      [
        loss("tiny", 1, -0.001, "2024-12-10", ["a"]),
        loss("L", 1, -50, "2024-12-12", ["b"]),
      ],
      [
        acq("a", 1, "2024-01-01"),
        acq("b", 1, "2024-01-02"),
        acq("r", 1, "2024-12-20"),
      ],
    );
    expect(out.extraCost.get("r")).toBe(50);
  });

  it("the Form 8949 adjustment and the carried cost come from one allocation", async () => {
    const { computeWashSaleCarryover, washSaleAdjustmentsFromAllocations } =
      await import("../wash-sale");
    const results = [loss("L", 10, -10000, "2023-12-15", ["a"])];
    const out = computeWashSaleCarryover(results, [
      acq("a", 10, "2023-06-01"),
      acq("r1", 4, "2023-12-20"),
      acq("r2", 6, "2024-01-10"),
    ]);
    const adj = washSaleAdjustmentsFromAllocations(out.allocations, results);
    const carried = [...out.extraCost.values()].reduce((n, v) => n + v, 0);
    expect(adj).toHaveLength(1);
    expect(adj[0].disallowedLoss).toBe(carried); // 10000 both ways: never counted twice
    expect(adj[0].fullDisallowance).toBe(true);
  });
});

describe("computeWashSaleCarryover: when a replacement lot counts as touched", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const loss = {
    event: {
      id: "L",
      asset: "BTC",
      amount: 1,
      proceedsUsd: 0,
      date: d("2024-12-20"),
      sourceId: "s",
    },
    matchedLots: [
      { lotId: "old", amountConsumed: 1, costBasisUsd: 0, fullyConsumed: true },
    ],
    gainLoss: -400,
    holdingPeriod: "SHORT_TERM" as const,
    method: "FIFO",
  };
  const acquisitions = [
    { lotId: "old", asset: "BTC", amount: 1, acquiredAt: d("2024-01-01") },
    { lotId: "r", asset: "BTC", amount: 1, acquiredAt: d("2025-01-05") },
  ];

  it("a sale in a LATER year does not disqualify the lot", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover([loss], acquisitions, {
      consumedAt: new Map([["r", d("2025-06-01")]]),
    });
    expect(out.extraCost.get("r")).toBe(400);
  });

  it("a sale in the SAME year as the loss does", async () => {
    const { computeWashSaleCarryover } = await import("../wash-sale");
    const out = computeWashSaleCarryover([loss], acquisitions, {
      consumedAt: new Map([["r", d("2024-12-28")]]),
    });
    expect(out.extraCost.size).toBe(0);
  });
});
