# Phase K: Tax Impact Simulator（投资模拟器）

**Goal:** 用户输入假设交易 → 预测税务影响（gain/loss、holding period、wash sale 风险）

---

## Task K1: 模拟器引擎 (tax-engine)

**File:** `packages/tax-engine/src/simulator.ts`
**Test:** `packages/tax-engine/src/__tests__/simulator.test.ts`

**函数签名:**

```typescript
export interface SimulationInput {
  asset: string;
  amount: number;
  pricePerUnit: number;
  date?: Date; // 默认 now
  method?: "FIFO" | "LIFO" | "HIFO";
  strictSilo?: boolean;
  sourceId?: string;
}

export interface SimulationResult {
  projectedGainLoss: number;
  holdingPeriod: "SHORT_TERM" | "LONG_TERM" | "MIXED";
  shortTermGainLoss: number;
  longTermGainLoss: number;
  proceeds: number;
  costBasis: number;
  matchedLots: Array<{
    lotId: string;
    amount: number;
    costBasis: number;
    acquiredAt: Date;
    holdingPeriod: "SHORT_TERM" | "LONG_TERM";
    gainLoss: number;
  }>;
  washSaleRisk: boolean;
  washSaleDisallowed: number;
  remainingPosition: {
    totalAmount: number;
    totalCostBasis: number;
    avgCostPerUnit: number;
  };
  insufficientLots: boolean;
  availableAmount: number;
}

export function simulateSale(
  lots: TaxLot[],
  input: SimulationInput,
  acquisitions?: AcquisitionRecord[],
): SimulationResult;
```

**核心逻辑:**

1. Deep clone lots (`structuredClone`)
2. 创建临时 CostBasisCalculator + TaxableEvent
3. 运行 calculate() 获取 CalculationResult
4. 对每个 matchedLot 计算独立 holding period 和 gain/loss
5. 若有 acquisitions，运行 detectWashSales 检查风险
6. 统计剩余持仓
7. 若 lots 不足 → `insufficientLots: true`，用可用量部分计算

**测试 (≥12):**

1. 基本卖出 — gain
2. 基本卖出 — loss
3. SHORT_TERM holding period
4. LONG_TERM holding period
5. MIXED holding period (多 lot 跨年)
6. FIFO vs LIFO 不同结果
7. 部分卖出（不消耗全部 lot）
8. 全部卖出（消耗所有 lot）
9. 超额卖出 → insufficientLots
10. Wash sale 风险检测
11. 原始 lots 不被 mutate（deep clone 验证）
12. remainingPosition 正确计算
13. strictSilo 模式

## Task K2: API 端点

**File:** Modify `apps/api/src/routes/tax.ts`

```
POST /api/v1/tax/simulate
Body: { asset, amount, pricePerUnit, method?, strictSilo? }
Response: { data: SimulationResult }
```

**逻辑:**

1. 获取用户的所有 TaxLot（同现有 form8949 路由模式）
2. 获取用户的 acquisitions（用于 wash sale 检测）
3. 调用 `simulateSale(lots, input, acquisitions)`
4. 返回结果

**测试:** 1 route test

## Task K3: 前端 UI

**File:** `apps/web/src/app/[locale]/simulator/page.tsx`

**UI 设计:**

- 输入区: Asset (下拉/输入) + Amount + Price per unit + Method 选择
- "Simulate" 按钮
- 结果区:
  - 📊 Projected Gain/Loss (颜色: 绿正红负)
  - ⏱ Holding Period (Short/Long/Mixed)
  - 📋 Matched Lots 明细表
  - ⚠️ Wash Sale Risk 警告（如有）
  - 📦 Remaining Position 汇总

**i18n keys:** `simulator.*` (EN + ZH)
**Nav:** 添加 "Simulator" 链接到导航
