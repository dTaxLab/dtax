/**
 * NFT Tax Calculation Tests
 *
 * Validates that NFT_MINT, NFT_PURCHASE, and NFT_SALE transactions
 * are correctly handled by the tax engine.
 *
 * Key NFT tax rules:
 * - NFTs may qualify as "collectibles" (28% max long-term rate per IRS Notice 2023-27)
 * - Each NFT is a unique lot (amount = 1, or fractional for ERC-1155)
 * - Asset format: "NFT:{collection}:{tokenId}" for unique identification
 * - De minimis: Specified NFT < $600/year exempt from broker reporting
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { CostBasisCalculator } from "../calculator";
import { generateForm8949 } from "../reports/form8949";
import type { TaxLot, TaxableEvent, LotDateMap } from "../types";

describe("NFT Tax Calculations", () => {
  // ─── NFT_MINT: Minting an NFT ─────────

  describe("NFT_MINT (minting)", () => {
    it("should create NFT lot with mint cost as basis", () => {
      // User mints an NFT, paying 0.08 ETH (ETH = $3,000)
      // The mint cost (ETH spent) is a taxable disposal of ETH
      // The resulting NFT lot has basis = ETH FMV + gas

      const ethLots: TaxLot[] = [
        {
          id: "eth-buy",
          asset: "ETH",
          amount: 1,
          costBasisUsd: 2000,
          acquiredAt: new Date("2024-06-01"),
          sourceId: "wallet-1",
        },
      ];

      // ETH disposal for mint payment
      const mintPayment: TaxableEvent = {
        id: "mint-eth-disposal",
        asset: "ETH",
        amount: 0.08,
        proceedsUsd: 240, // 0.08 ETH × $3,000
        date: new Date("2025-03-15"),
        sourceId: "wallet-1",
        feeUsd: 15, // gas fee
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(ethLots);
      const result = calc.calculate(mintPayment);

      // Cost basis of 0.08 ETH: (2000/1) × 0.08 = $160
      // Gain: $240 - $160 - $15 = $65
      expect(result.gainLoss).toBeCloseTo(65, 2);
      expect(result.holdingPeriod).toBe("SHORT_TERM");
    });

    it("should track NFT lot with unique asset identifier", () => {
      // After minting, a new lot is created for the NFT
      const nftLot: TaxLot = {
        id: "nft-bayc-1234",
        asset: "NFT:BAYC:1234",
        amount: 1,
        costBasisUsd: 255, // 0.08 ETH FMV ($240) + gas ($15)
        acquiredAt: new Date("2025-03-15"),
        sourceId: "wallet-1",
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([nftLot]);

      const lots = calc.getLots();
      expect(lots).toHaveLength(1);
      expect(lots[0].asset).toBe("NFT:BAYC:1234");
      expect(lots[0].amount).toBe(1);
    });
  });

  // ─── NFT_PURCHASE: Buying an NFT on marketplace ─────────

  describe("NFT_PURCHASE (buying on marketplace)", () => {
    it("should calculate ETH disposal gain when purchasing NFT", () => {
      const ethLots: TaxLot[] = [
        {
          id: "eth-lot",
          asset: "ETH",
          amount: 10,
          costBasisUsd: 15000, // $1,500/ETH
          acquiredAt: new Date("2023-01-01"),
          sourceId: "wallet-1",
        },
      ];

      // Buy NFT for 2 ETH when ETH = $3,500
      const purchase: TaxableEvent = {
        id: "nft-purchase-1",
        asset: "ETH",
        amount: 2,
        proceedsUsd: 7000, // 2 × $3,500
        date: new Date("2025-05-01"),
        sourceId: "wallet-1",
        feeUsd: 50, // marketplace + gas fees
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(ethLots);
      const result = calc.calculate(purchase);

      // Cost basis: 2 ETH × $1,500 = $3,000
      // Gain: $7,000 - $3,000 - $50 = $3,950
      expect(result.gainLoss).toBeCloseTo(3950, 2);
      expect(result.holdingPeriod).toBe("LONG_TERM"); // > 1 year
    });
  });

  // ─── NFT_SALE: Selling an NFT ─────────

  describe("NFT_SALE (selling)", () => {
    it("should calculate gain on NFT sale", () => {
      const nftLot: TaxLot[] = [
        {
          id: "nft-lot-1",
          asset: "NFT:BAYC:1234",
          amount: 1,
          costBasisUsd: 255,
          acquiredAt: new Date("2025-03-15"),
          sourceId: "wallet-1",
        },
      ];

      // Sell NFT for 0.5 ETH when ETH = $4,000 → $2,000 proceeds
      const sale: TaxableEvent = {
        id: "nft-sale-1",
        asset: "NFT:BAYC:1234",
        amount: 1,
        proceedsUsd: 2000,
        date: new Date("2025-09-01"),
        sourceId: "wallet-1",
        feeUsd: 25, // marketplace royalty + gas
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(nftLot);
      const result = calc.calculate(sale);

      // Gain: $2,000 - $255 - $25 = $1,720
      expect(result.gainLoss).toBeCloseTo(1720, 2);
      expect(result.holdingPeriod).toBe("SHORT_TERM");
      expect(result.matchedLots).toHaveLength(1);
      expect(result.matchedLots[0].fullyConsumed).toBe(true);
    });

    it("should calculate loss on NFT sale", () => {
      const nftLot: TaxLot[] = [
        {
          id: "nft-expensive",
          asset: "NFT:CRYPTOPUNKS:5678",
          amount: 1,
          costBasisUsd: 50000,
          acquiredAt: new Date("2024-01-01"),
          sourceId: "wallet-1",
        },
      ];

      // Sell at a loss
      const sale: TaxableEvent = {
        id: "nft-sale-loss",
        asset: "NFT:CRYPTOPUNKS:5678",
        amount: 1,
        proceedsUsd: 20000,
        date: new Date("2025-06-01"),
        sourceId: "wallet-1",
        feeUsd: 100,
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(nftLot);
      const result = calc.calculate(sale);

      // Loss: $20,000 - $50,000 - $100 = -$30,100
      expect(result.gainLoss).toBe(-30100);
      expect(result.holdingPeriod).toBe("LONG_TERM");
    });
  });

  // ─── ERC-1155 Multi-token NFTs ─────────

  describe("ERC-1155 (semi-fungible NFTs)", () => {
    it("should handle partial sale of ERC-1155 tokens", () => {
      // ERC-1155: user owns 10 copies of an NFT edition
      const lots: TaxLot[] = [
        {
          id: "erc1155-lot",
          asset: "NFT:ART-BLOCKS:42",
          amount: 10,
          costBasisUsd: 5000, // $500 each
          acquiredAt: new Date("2024-06-01"),
          sourceId: "wallet-1",
        },
      ];

      // Sell 3 copies
      const sale: TaxableEvent = {
        id: "erc1155-sale",
        asset: "NFT:ART-BLOCKS:42",
        amount: 3,
        proceedsUsd: 2400, // $800 each
        date: new Date("2025-08-01"),
        sourceId: "wallet-1",
      };

      const calc = new CostBasisCalculator("FIFO");
      calc.addLots(lots);
      const result = calc.calculate(sale);

      // Cost basis: 3 × $500 = $1,500
      // Gain: $2,400 - $1,500 = $900
      expect(result.gainLoss).toBe(900);
      expect(result.holdingPeriod).toBe("LONG_TERM");

      // 7 copies remaining
      const remaining = calc.getLots().find((l) => l.id === "erc1155-lot");
      expect(remaining?.amount).toBeCloseTo(7, 5);
    });
  });

  // ─── Full NFT lifecycle with Form 8949 ─────────

  describe("Form 8949 for NFT transactions", () => {
    it("should generate correct Form 8949 lines for NFT sale", () => {
      const calc = new CostBasisCalculator("FIFO");
      calc.addLots([
        {
          id: "nft-lot",
          asset: "NFT:BAYC:1234",
          amount: 1,
          costBasisUsd: 5000,
          acquiredAt: new Date("2024-02-01"),
          sourceId: "w1",
        },
      ]);

      const sale: TaxableEvent = {
        id: "nft-sold",
        asset: "NFT:BAYC:1234",
        amount: 1,
        proceedsUsd: 15000,
        date: new Date("2025-04-01"),
        sourceId: "w1",
        feeUsd: 100,
      };

      const result = calc.calculate(sale);
      const lotDates: LotDateMap = new Map([
        ["nft-lot", new Date("2024-02-01")],
      ]);

      const report = generateForm8949([result], {
        taxYear: 2025,
        lotDates,
        reportingBasis: "none",
      });

      expect(report.lines).toHaveLength(1);
      const line = report.lines[0];
      expect(line.description).toContain("NFT:BAYC:1234");
      expect(line.proceeds).toBe(15000);
      expect(line.costBasis).toBe(5000);
      expect(line.adjustmentAmount).toBe(-100); // fee
      expect(line.gainLoss).toBeCloseTo(9900, 2);
      expect(line.holdingPeriod).toBe("LONG_TERM");
    });
  });
});
