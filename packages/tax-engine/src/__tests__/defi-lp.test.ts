/**
 * DeFi LP (Liquidity Provision) Tax Calculation Tests
 *
 * Validates that LP_DEPOSIT, LP_WITHDRAWAL, and LP_REWARD transactions
 * are correctly handled by the tax engine:
 * - LP_DEPOSIT: disposal of deposited tokens → capital gain/loss
 * - LP_WITHDRAWAL: disposal of LP token → capital gain/loss, new lots for withdrawn tokens
 * - LP_REWARD: ordinary income at FMV, creates new tax lot
 *
 * IRS position: No specific LP guidance exists. Conservative treatment
 * treats deposits/withdrawals as taxable dispositions.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import { generateForm8949 } from "../reports/form8949";
import type { TaxLot, TaxableEvent, LotDateMap } from "../types";

describe("DeFi LP Tax Calculations", () => {
  // ─── LP_DEPOSIT: User deposits ETH into Uniswap pool ─────────

  describe("LP_DEPOSIT (providing liquidity)", () => {
    it("should calculate capital gain on LP deposit", () => {
      // User bought 10 ETH at $2,000 each
      const lots: TaxLot[] = [
        {
          id: "buy-eth",
          asset: "ETH",
          amount: 10,
          costBasisUsd: 20000,
          acquiredAt: new Date("2024-01-15"),
          sourceId: "wallet-1",
        },
      ];

      // User deposits 5 ETH into Uniswap when ETH = $3,000
      // This is a taxable disposition of ETH
      const deposit: TaxableEvent = {
        id: "lp-deposit-1",
        asset: "ETH",
        amount: 5,
        proceedsUsd: 15000, // 5 ETH × $3,000 FMV
        date: new Date("2025-06-01"),
        sourceId: "wallet-1",
        feeUsd: 10, // gas fee
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(lots);
      const result = calc.calculate(deposit);

      // Cost basis: 5 ETH × ($20,000/10) = $10,000
      // Gain: $15,000 - $10,000 - $10 fee = $4,990
      expect(result.gainLoss).toBeCloseTo(4990, 2);
      expect(result.holdingPeriod).toBe("LONG_TERM"); // > 1 year
      expect(result.matchedLots).toHaveLength(1);
      expect(result.matchedLots[0].amountConsumed).toBe(5);

      // Remaining ETH lot should be 5 ETH
      const remaining = calc.getLots().find((l) => l.id === "buy-eth");
      expect(remaining?.amount).toBe(5);
    });

    it("should calculate capital loss on LP deposit", () => {
      // Bought ETH at $4,000
      const lots: TaxLot[] = [
        {
          id: "buy-eth-high",
          asset: "ETH",
          amount: 5,
          costBasisUsd: 20000,
          acquiredAt: new Date("2024-11-01"),
          sourceId: "wallet-1",
        },
      ];

      // Deposit when ETH dropped to $2,000
      const deposit: TaxableEvent = {
        id: "lp-deposit-loss",
        asset: "ETH",
        amount: 5,
        proceedsUsd: 10000, // 5 × $2,000
        date: new Date("2025-03-01"),
        sourceId: "wallet-1",
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(lots);
      const result = calc.calculate(deposit);

      // Loss: $10,000 - $20,000 = -$10,000
      expect(result.gainLoss).toBe(-10000);
      expect(result.holdingPeriod).toBe("SHORT_TERM"); // < 1 year
    });
  });

  // ─── LP_WITHDRAWAL: User removes liquidity ─────────

  describe("LP_WITHDRAWAL (removing liquidity)", () => {
    it("should calculate gain on LP token disposal", () => {
      // LP token received at deposit (basis = FMV of deposited assets)
      const lots: TaxLot[] = [
        {
          id: "lp-token",
          asset: "UNI-V2-ETH-USDC",
          amount: 100,
          costBasisUsd: 15000, // FMV at time of deposit
          acquiredAt: new Date("2025-01-01"),
          sourceId: "wallet-1",
        },
      ];

      // Withdrawal: LP token → ETH + USDC, FMV of withdrawn = $20,000
      const withdrawal: TaxableEvent = {
        id: "lp-withdraw-1",
        asset: "UNI-V2-ETH-USDC",
        amount: 100,
        proceedsUsd: 20000, // FMV of withdrawn assets
        date: new Date("2025-07-01"),
        sourceId: "wallet-1",
        feeUsd: 15,
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(lots);
      const result = calc.calculate(withdrawal);

      // Gain: $20,000 - $15,000 - $15 = $4,985
      expect(result.gainLoss).toBeCloseTo(4985, 2);
      expect(result.holdingPeriod).toBe("SHORT_TERM"); // 6 months
    });
  });

  // ─── LP_REWARD: Farming rewards as income ─────────

  describe("LP_REWARD (yield farming income)", () => {
    it("should create income lot with FMV as cost basis", () => {
      // LP rewards create new lots — the FMV at receipt IS the cost basis
      // (reported as ordinary income on Schedule 1)
      const rewardLot: TaxLot = {
        id: "lp-reward-1",
        asset: "UNI",
        amount: 500,
        costBasisUsd: 2500, // 500 UNI × $5.00 FMV at receipt
        acquiredAt: new Date("2025-06-15"),
        sourceId: "wallet-1",
      };

      // Later sell the reward tokens at higher price
      const sell: TaxableEvent = {
        id: "sell-reward",
        asset: "UNI",
        amount: 500,
        proceedsUsd: 5000, // 500 UNI × $10.00
        date: new Date("2025-12-15"),
        sourceId: "wallet-1",
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([rewardLot]);
      const result = calc.calculate(sell);

      // Gain: $5,000 - $2,500 = $2,500 (short-term)
      expect(result.gainLoss).toBe(2500);
      expect(result.holdingPeriod).toBe("SHORT_TERM");
    });
  });

  // ─── Full LP Lifecycle: Deposit → Earn → Withdraw → Sell ─────────

  describe("Full LP lifecycle", () => {
    it("should correctly track basis through deposit → withdraw → sell", () => {
      const calc = new CostBasisCalculator("FIFO");

      // Step 1: Buy 10 ETH at $2,000
      calc.addLots([
        {
          id: "initial-buy",
          asset: "ETH",
          amount: 10,
          costBasisUsd: 20000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "wallet-1",
        },
      ]);

      // Step 2: Deposit 5 ETH into LP pool (ETH now $3,000)
      const depositResult = calc.calculate({
        id: "deposit",
        asset: "ETH",
        amount: 5,
        proceedsUsd: 15000,
        date: new Date("2025-02-01"),
        sourceId: "wallet-1",
        feeUsd: 5,
      });
      expect(depositResult.gainLoss).toBeCloseTo(4995, 2); // 15000 - 10000 - 5

      // Step 3: Add LP token lot (basis = FMV of deposited assets)
      calc.addLots([
        {
          id: "lp-token",
          asset: "LP-ETH-USDC",
          amount: 50,
          costBasisUsd: 15000,
          acquiredAt: new Date("2025-02-01"),
          sourceId: "wallet-1",
        },
      ]);

      // Step 4: Receive farming rewards
      calc.addLots([
        {
          id: "reward-lot",
          asset: "CAKE",
          amount: 200,
          costBasisUsd: 1000, // $5 each at receipt
          acquiredAt: new Date("2025-06-01"),
          sourceId: "wallet-1",
        },
      ]);

      // Step 5: Withdraw liquidity (LP token now worth $18,000)
      const withdrawResult = calc.calculate({
        id: "withdraw",
        asset: "LP-ETH-USDC",
        amount: 50,
        proceedsUsd: 18000,
        date: new Date("2025-08-01"),
        sourceId: "wallet-1",
        feeUsd: 10,
      });
      expect(withdrawResult.gainLoss).toBeCloseTo(2990, 2); // 18000 - 15000 - 10

      // Step 6: Sell farming rewards at $8 each
      const sellRewardResult = calc.calculate({
        id: "sell-rewards",
        asset: "CAKE",
        amount: 200,
        proceedsUsd: 1600,
        date: new Date("2025-09-01"),
        sourceId: "wallet-1",
      });
      expect(sellRewardResult.gainLoss).toBe(600); // 1600 - 1000

      // Verify remaining: 5 ETH from initial buy still available
      const remainingEth = calc
        .getLots()
        .filter((l) => l.asset === "ETH" && l.amount > 0);
      expect(remainingEth).toHaveLength(1);
      expect(remainingEth[0].amount).toBe(5);
    });
  });

  // ─── Form 8949 for LP transactions ─────────

  describe("Form 8949 generation with LP transactions", () => {
    it("should include LP deposit and withdrawal in Form 8949", () => {
      const calc = new CostBasisCalculator("FIFO");

      calc.addLots([
        {
          id: "eth-lot",
          asset: "ETH",
          amount: 5,
          costBasisUsd: 10000,
          acquiredAt: new Date("2024-03-01"),
          sourceId: "w1",
        },
        {
          id: "lp-lot",
          asset: "LP-ETH",
          amount: 10,
          costBasisUsd: 15000,
          acquiredAt: new Date("2025-01-15"),
          sourceId: "w1",
        },
      ]);

      const events: TaxableEvent[] = [
        {
          id: "dep",
          asset: "ETH",
          amount: 5,
          proceedsUsd: 15000,
          date: new Date("2025-03-01"),
          sourceId: "w1",
          feeUsd: 5,
        },
        {
          id: "wit",
          asset: "LP-ETH",
          amount: 10,
          proceedsUsd: 18000,
          date: new Date("2025-06-01"),
          sourceId: "w1",
          feeUsd: 8,
        },
      ];

      const results = events.map((e) => calc.calculate(e));
      const lotDates: LotDateMap = new Map([
        ["eth-lot", new Date("2024-03-01")],
        ["lp-lot", new Date("2025-01-15")],
      ]);

      const report = generateForm8949(results, {
        taxYear: 2025,
        lotDates,
        reportingBasis: "none",
      });

      // Should have 2 lines (deposit + withdrawal)
      expect(report.lines).toHaveLength(2);

      // ETH deposit: long-term (acquired 2024-03 → sold 2025-03)
      const ethLine = report.lines.find((l) => l.description.includes("ETH"));
      expect(ethLine).toBeDefined();
      expect(ethLine!.proceeds).toBe(15000);

      // LP withdrawal: short-term (acquired 2025-01 → sold 2025-06)
      const lpLine = report.lines.find((l) => l.description.includes("LP-ETH"));
      expect(lpLine).toBeDefined();
      expect(lpLine!.proceeds).toBe(18000);
    });
  });
});
