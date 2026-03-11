/**
 * Risk Scanner 单元测试
 */

import { describe, it, expect } from "vitest";
import { scanRisks, type RiskScanTransaction } from "../risk-scanner";

function makeTx(
  overrides: Partial<RiskScanTransaction> & { id: string },
): RiskScanTransaction {
  return {
    type: "BUY",
    timestamp: new Date("2025-06-15T12:00:00Z"),
    ...overrides,
  };
}

describe("Risk Scanner", () => {
  it("无风险场景返回 score 100", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "BUY",
        receivedAsset: "BTC",
        receivedAmount: 1,
        receivedValueUsd: 30000,
      }),
    ];
    const report = scanRisks(txs, 2025);
    expect(report.overallScore).toBe(100);
    expect(report.items).toHaveLength(0);
    expect(report.summary.high).toBe(0);
  });

  it("检测缺失成本基础", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "SELL",
        sentAsset: "BTC",
        sentAmount: 1,
        sentValueUsd: 30000,
        // costBasis is undefined
      }),
    ];
    const report = scanRisks(txs, 2025);
    const risk = report.items.find((i) => i.category === "missing_cost_basis");
    expect(risk).toBeDefined();
    expect(risk!.severity).toBe("high");
    expect(risk!.affectedTransactionIds).toContain("1");
    expect(risk!.potentialTaxImpact).toBe(30000);
  });

  it("检测洗售风险", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "sell-1",
        type: "SELL",
        sentAsset: "BTC",
        sentAmount: 1,
        gainLoss: -5000,
        costBasis: 35000,
        timestamp: new Date("2025-06-01T12:00:00Z"),
      }),
      makeTx({
        id: "buy-1",
        type: "BUY",
        receivedAsset: "BTC",
        receivedAmount: 1,
        timestamp: new Date("2025-06-15T12:00:00Z"), // 14 days later
      }),
    ];
    const report = scanRisks(txs, 2025);
    const risk = report.items.find((i) => i.category === "wash_sale_risk");
    expect(risk).toBeDefined();
    expect(risk!.severity).toBe("high");
    expect(risk!.potentialTaxImpact).toBe(5000);
  });

  it("未报告收入检测", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "STAKING_REWARD",
        receivedAsset: "ETH",
        receivedAmount: 0.1,
        receivedValueUsd: 0, // Missing USD value
      }),
    ];
    const report = scanRisks(txs, 2025);
    const risk = report.items.find((i) => i.category === "unreported_income");
    expect(risk).toBeDefined();
    expect(risk!.severity).toBe("medium");
  });

  it("AI 低置信度检测", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "DEX_SWAP",
        aiClassified: true,
        aiConfidence: 0.5,
        sentAsset: "ETH",
        sentAmount: 1,
      }),
    ];
    const report = scanRisks(txs, 2025);
    const risk = report.items.find((i) => i.category === "ai_low_confidence");
    expect(risk).toBeDefined();
    expect(risk!.severity).toBe("medium");
  });

  it("高价值未验证 AI 分类检测", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "TRADE",
        aiClassified: true,
        aiConfidence: 0.75,
        sentAsset: "BTC",
        sentAmount: 1,
        sentValueUsd: 50000,
      }),
    ];
    const report = scanRisks(txs, 2025);
    const risk = report.items.find(
      (i) => i.category === "high_value_unverified",
    );
    expect(risk).toBeDefined();
    expect(risk!.severity).toBe("high");
    expect(risk!.potentialTaxImpact).toBe(50000);
  });

  it("可疑重复检测", () => {
    const ts = new Date("2025-06-15T12:00:00Z");
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "BUY",
        receivedAsset: "BTC",
        receivedAmount: 1,
        timestamp: ts,
      }),
      makeTx({
        id: "2",
        type: "BUY",
        receivedAsset: "BTC",
        receivedAmount: 1,
        timestamp: new Date(ts.getTime() + 10000), // 10s later
      }),
    ];
    const report = scanRisks(txs, 2025);
    const risk = report.items.find(
      (i) => i.category === "duplicate_suspicious",
    );
    expect(risk).toBeDefined();
    expect(risk!.severity).toBe("low");
    expect(risk!.affectedTransactionIds).toHaveLength(2);
  });

  it("评分算法正确性", () => {
    // 2 high + 1 medium + 1 low = 100 - (2*15 + 1*5 + 1*1) = 64
    const txs: RiskScanTransaction[] = [
      // missing basis (high)
      makeTx({ id: "1", type: "SELL", sentAsset: "BTC", sentValueUsd: 1000 }),
      // wash sale (high) — loss + repurchase
      makeTx({
        id: "2",
        type: "SELL",
        sentAsset: "ETH",
        gainLoss: -100,
        costBasis: 500,
        timestamp: new Date("2025-03-01"),
      }),
      makeTx({
        id: "3",
        type: "BUY",
        receivedAsset: "ETH",
        timestamp: new Date("2025-03-10"),
      }),
      // unreported income (medium)
      makeTx({
        id: "4",
        type: "AIRDROP",
        receivedAsset: "TOKEN",
        receivedValueUsd: 0,
      }),
      // duplicate (low)
      makeTx({
        id: "5",
        type: "BUY",
        receivedAsset: "SOL",
        receivedAmount: 10,
        timestamp: new Date("2025-07-01T00:00:00Z"),
      }),
      makeTx({
        id: "6",
        type: "BUY",
        receivedAsset: "SOL",
        receivedAmount: 10,
        timestamp: new Date("2025-07-01T00:00:30Z"),
      }),
    ];
    const report = scanRisks(txs, 2025);
    expect(report.summary.high).toBe(2);
    expect(report.summary.medium).toBe(1);
    expect(report.summary.low).toBe(1);
    expect(report.overallScore).toBe(64);
  });

  it("综合场景多风险叠加", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "SELL",
        sentAsset: "BTC",
        sentValueUsd: 100000,
        aiClassified: true,
        aiConfidence: 0.6,
      }),
      makeTx({
        id: "2",
        type: "STAKING_REWARD",
        receivedAsset: "ETH",
        receivedValueUsd: 0,
      }),
    ];
    const report = scanRisks(txs, 2025);
    // tx1: missing_cost_basis (high) + high_value_unverified (high) + ai_low_confidence (medium)
    // tx2: unreported_income (medium)
    expect(report.items.length).toBeGreaterThanOrEqual(4);
    expect(report.overallScore).toBeLessThanOrEqual(60);
  });

  it("仅扫描指定税年交易", () => {
    const txs: RiskScanTransaction[] = [
      makeTx({
        id: "1",
        type: "SELL",
        sentAsset: "BTC",
        timestamp: new Date("2024-06-15"),
      }),
      makeTx({
        id: "2",
        type: "BUY",
        receivedAsset: "BTC",
        timestamp: new Date("2025-06-15"),
      }),
    ];
    const report = scanRisks(txs, 2025);
    // Only 2025 tx, which is a BUY — no risks
    expect(report.items).toHaveLength(0);
    expect(report.overallScore).toBe(100);
  });

  it("score 不低于 0", () => {
    // 7 high risks = 100 - 105 → clamped to 0
    const txs: RiskScanTransaction[] = [];
    for (let i = 0; i < 7; i++) {
      txs.push(
        makeTx({
          id: `sell-${i}`,
          type: "SELL",
          sentAsset: "BTC",
          sentValueUsd: 10000,
          timestamp: new Date(`2025-0${i + 1}-01`),
        }),
      );
    }
    const report = scanRisks(txs, 2025);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
  });
});
