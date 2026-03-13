# 大文件拆分重构 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将超过 350 行的大文件按职责拆分为小模块，提升可维护性和可读性，遵循 CLAUDE.md 中"每个文件应有单一职责"的原则。

**Architecture:** 纯重构，不改变外部 API。通过提取子模块 + re-export 保持向后兼容。每个文件拆分后运行完整测试确保无回归。

**Tech Stack:** TypeScript, tsup (重新构建)

---

### Task 1: form8949-pdf.ts 拆分 (11,701 行 → 4 文件)

**Files:**

- Modify: `packages/tax-engine/src/reports/form8949-pdf.ts`
- Create: `packages/tax-engine/src/reports/pdf/template.ts` (PDF 页面模板和布局)
- Create: `packages/tax-engine/src/reports/pdf/renderer.ts` (pdfkit 渲染逻辑)
- Create: `packages/tax-engine/src/reports/pdf/data-formatter.ts` (数据格式化和分页计算)
- Create: `packages/tax-engine/src/reports/pdf/types.ts` (PDF 相关类型)

**Step 1: 分析现有文件结构**

Read `form8949-pdf.ts` 识别逻辑边界:

- IRS 表单模板定义（坐标、字体、页边距）→ `template.ts`
- pdfkit 绘制函数（drawHeader, drawRow, drawFooter）→ `renderer.ts`
- 数据准备（分组、分页、格式化金额/日期）→ `data-formatter.ts`
- 类型定义 → `types.ts`

**Step 2: 提取子模块，原文件改为 re-export**

```typescript
// form8949-pdf.ts (瘦身后)
export { generateForm8949Pdf } from "./pdf/renderer.js";
export type { PdfOptions } from "./pdf/types.js";
```

**Step 3: 运行测试确保无回归**

Run: `cd packages/tax-engine && npx vitest run src/__tests__/form8949-pdf.test.ts`
Expected: PASS (所有现有测试不变)

**Step 4: Commit**

```bash
git add packages/tax-engine/src/reports/
git commit -m "refactor: split form8949-pdf.ts into template, renderer, formatter modules"
```

---

### Task 2: risk-scanner.ts 拆分 (8,553 行 → 4 文件)

**Files:**

- Modify: `packages/tax-engine/src/risk-scanner.ts`
- Create: `packages/tax-engine/src/risk/rules.ts` (风险规则定义)
- Create: `packages/tax-engine/src/risk/analyzer.ts` (风险分析引擎)
- Create: `packages/tax-engine/src/risk/types.ts` (风险类型)
- Create: `packages/tax-engine/src/risk/index.ts` (re-export)

**拆分逻辑:**

- 规则定义（wash sale check, missing cost basis, large transactions 等）→ `rules.ts`
- 分析引擎（遍历交易，应用规则，评分）→ `analyzer.ts`
- 类型（RiskLevel, RiskItem, RiskReport）→ `types.ts`

**Step 1: 提取并重构**

**Step 2: 运行测试**

Run: `cd packages/tax-engine && npx vitest run src/__tests__/risk-scanner.test.ts`

**Step 3: Commit**

```bash
git add packages/tax-engine/src/risk/ packages/tax-engine/src/risk-scanner.ts
git commit -m "refactor: split risk-scanner.ts into rules, analyzer, types modules"
```

---

### Task 3: form8949.ts 拆分 (8,928 行 → 3 文件)

**Files:**

- Modify: `packages/tax-engine/src/reports/form8949.ts`
- Create: `packages/tax-engine/src/reports/form8949/calculator.ts` (增益/损失计算)
- Create: `packages/tax-engine/src/reports/form8949/formatter.ts` (输出格式化)
- Create: `packages/tax-engine/src/reports/form8949/types.ts`

**Step 1: 拆分**
**Step 2: 测试** — `npx vitest run src/__tests__/form8949.test.ts`
**Step 3: Commit**

---

### Task 4: simulator.ts 拆分 (7,279 行 → 3 文件)

**Files:**

- Modify: `packages/tax-engine/src/simulator.ts`
- Create: `packages/tax-engine/src/simulator/engine.ts` (模拟引擎)
- Create: `packages/tax-engine/src/simulator/scenarios.ts` (场景定义)
- Create: `packages/tax-engine/src/simulator/types.ts`

**Step 1: 拆分**
**Step 2: 测试** — `npx vitest run src/__tests__/simulator.test.ts`
**Step 3: Commit**

---

### Task 5: wash-sale.ts 拆分 (5,922 行 → 3 文件)

**Files:**

- Modify: `packages/tax-engine/src/wash-sale.ts`
- Create: `packages/tax-engine/src/wash-sale/detector.ts` (30天窗口检测)
- Create: `packages/tax-engine/src/wash-sale/adjuster.ts` (成本基础调整)
- Create: `packages/tax-engine/src/wash-sale/types.ts`

**Step 1: 拆分**
**Step 2: 测试** — `npx vitest run src/__tests__/wash-sale.test.ts`
**Step 3: Commit**

---

### Task 6: optimizer.ts 拆分 (5,675 行 → 3 文件)

**Files:**

- Modify: `packages/tax-engine/src/optimizer.ts`
- Create: `packages/tax-engine/src/optimizer/comparator.ts` (方法对比逻辑)
- Create: `packages/tax-engine/src/optimizer/reporter.ts` (对比报告生成)
- Create: `packages/tax-engine/src/optimizer/types.ts`

**Step 1: 拆分**
**Step 2: 测试** — `npx vitest run src/__tests__/optimizer.test.ts`
**Step 3: Commit**

---

### Task 7: 更新 index.ts 导出

**Files:**

- Modify: `packages/tax-engine/src/index.ts`

确保所有 re-export 正确，外部消费者的 import 路径不变。

Run: `cd packages/tax-engine && pnpm build`
Expected: 构建成功

**Commit**

---

### Task 8: 五步法审计

**Step 1: 类型安全** — `pnpm -r exec tsc --noEmit`

**Step 2: 测试回归** — `pnpm test` (全部 977+ 测试通过)

**Step 3: 安全** — 纯重构，无新安全面

**Step 4: i18n** — N/A（纯引擎层）

**Step 5: 构建** — `pnpm build` (确保 dist/ 输出正确)

**验证关键点:**

- npm pack --dry-run 确认导出文件完整
- CLI 使用 tax-engine 的集成测试通过
- API 使用 tax-engine 的路由测试通过
