# Phase L: Method Comparison + Tax Optimization

**Goal:** 对同一笔假设交易，同时展示 FIFO/LIFO/HIFO 三种方法的结果对比，推荐最优方法

---

## Task L1: 方法对比引擎 (tax-engine)

**File:** `packages/tax-engine/src/optimizer.ts`
**Test:** `packages/tax-engine/src/__tests__/optimizer.test.ts`

```typescript
export interface ComparisonResult {
  fifo: SimulationResult;
  lifo: SimulationResult;
  hifo: SimulationResult;
  recommended: "FIFO" | "LIFO" | "HIFO";
  recommendedReason: string;
  savings: number; // 最优 vs 最差的差额
}

export function compareAllMethods(
  lots: TaxLot[],
  input: Omit<SimulationInput, "method">,
  acquisitions?: AcquisitionRecord[],
): ComparisonResult;
```

**推荐逻辑:**

- 若全部为 gain: 推荐 tax 最低的（gainLoss 最小的）
- 若有 loss: 推荐 loss 最大的（更多抵扣），但需检查 wash sale
- 若某方法触发 wash sale 而其他不触发: 降权
- savings = Math.abs(worst.projectedGainLoss - best.projectedGainLoss)

**测试 (≥10):**

1. 三种方法返回不同结果
2. 推荐 gain 最小的方法（全 gain 场景）
3. 推荐 loss 最大的方法（全 loss 场景）
4. Wash sale 降权
5. savings 计算正确
6. 三种方法结果相同时推荐 FIFO（默认）
7. 原始 lots 不被 mutate
8. insufficientLots 一致传播
9. recommendedReason 非空
10. 单 lot 场景（三方法结果相同）

## Task L2: API + 前端

**API:** `POST /api/v1/tax/compare-methods`

```
Body: { asset, amount, pricePerUnit }
Response: { data: ComparisonResult }
```

**前端:** 在 simulator 页面下方添加 "Compare All Methods" 按钮

- 点击后并排展示 FIFO/LIFO/HIFO 三列对比卡片
- 推荐方法高亮 + 徽章
- 节省金额显示
- i18n EN/ZH
