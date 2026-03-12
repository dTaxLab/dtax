# Phase I: TurboTax TXF 导出

**Goal:** 从 Form8949Report 生成 TXF (Tax Exchange Format V042) 文件，用户可直接导入 TurboTax

**Architecture:** 纯函数 `form8949ToTxf()` 在 tax-engine 中，API 新增 `format: "txf"` 选项，前端添加下载按钮

---

## Task I1: TXF 生成器 (tax-engine)

**Files:**

- Create: `packages/tax-engine/src/reports/form8949-txf.ts`
- Test: `packages/tax-engine/src/__tests__/form8949-txf.test.ts`

**函数签名:**

```typescript
export function form8949ToTxf(report: Form8949Report): string;
```

**TXF V042 格式:**

文件头（每个文件一次）:

```
V042
ADTax Crypto Tax Calculator
D03/11/2026
^
```

每条 Form8949Line 生成一个记录:

```
TD
N<refnum>
C1
L1
P<description>
D<dateAcquired MM/DD/YYYY>
D<dateSold MM/DD/YYYY>
$<costBasis>
$<proceeds>
^
```

若有 wash sale (adjustmentCode 包含 "W")，使用 Format 5 (多一行 $):

```
TD
N<refnum>
C1
L1
P<description>
D<dateAcquired MM/DD/YYYY>
D<dateSold MM/DD/YYYY>
$<costBasis>
$<proceeds>
$<wash sale disallowed amount>
^
```

**Box → TXF Ref Number 映射 (加密货币默认 Box C/F):**

| Form 8949 Box | Holding Period | 1099-B Status      | TXF Refnum |
| ------------- | -------------- | ------------------ | ---------- |
| A             | Short-term     | Reported correct   | 321        |
| B             | Short-term     | Reported incorrect | 711        |
| C             | Short-term     | Not reported       | 712        |
| D             | Long-term      | Reported correct   | 323        |
| E             | Long-term      | Reported incorrect | 713        |
| F             | Long-term      | Not reported       | 714        |

**日期处理:**

- `dateAcquired` = "VARIOUS" → 输出空 `D` (仅前缀无值)
- 正常日期已是 `MM/DD/YYYY` 格式，直接输出

**金额处理:**

- 使用 `toFixed(2)` 格式化
- costBasis 和 proceeds 均为正数
- wash sale disallowed amount 为正数 (从 adjustmentAmount 中提取)

**Wash Sale 金额提取:**

- adjustmentCode 包含 "W" 时
- disallowed = adjustmentAmount (若同时有 "E", 需从 adjustmentAmount 中剥离 fee 部分)
- 简化: 当 code="W" → disallowed = adjustmentAmount
- 当 code="E;W" → disallowed = adjustmentAmount + feeUsd (因为 adjustmentAmount = -fee + disallowed)
- 但 Form8949Line 没有独立 feeUsd 字段...
- **实际方案**: 直接用 `Math.abs(adjustmentAmount)` 作为 wash sale amount（当 code="W"）; 当 code="E;W" 时 TXF 不支持同时传两个 adjustment，使用 costBasis 已含 fee 调整后的值，wash sale amount = adjustmentAmount + (原始 gainLoss - (proceeds - costBasis))...
- **最简方案**: TXF Format 5 的第三个 `$` 是 wash sale disallowed amount。当 adjustmentCode 包含 "W":
  - 若 code = "W": `disallowed = adjustmentAmount` (adjustmentAmount 已是正数 disallowed loss)
  - 若 code = "E;W": 不使用 Format 5，改用 Format 4（fee 已在 costBasis 中调整）
  - 实际上大多数加密交易 adjustmentCode 要么是 "" 或 "E" 或 "W"，"E;W" 极少

**测试用例 (≥15):**

1. TXF 文件头格式 (V042, program name, date)
2. 短期交易 Box C → refnum 712
3. 长期交易 Box F → refnum 714
4. Box A → refnum 321
5. Box B → refnum 711
6. Box D → refnum 323
7. Box E → refnum 713
8. 日期格式正确 (MM/DD/YYYY)
9. "VARIOUS" dateAcquired → 空 D 行
10. 金额格式 (2 位小数)
11. Wash sale → Format 5 (第三个 $ 行)
12. 无 wash sale → Format 4 (两个 $ 行)
13. 多条记录正确拼接
14. 空报告 → 仅文件头
15. 记录以 ^ 分隔

## Task I2: API + 前端集成

**Files:**

- Modify: `apps/api/src/routes/tax.ts` — form8949 endpoint 添加 `format: "txf"` 到 schema + switch
- Modify: `apps/web/src/app/[locale]/tax/page.tsx` — 添加 "Download TXF (TurboTax)" 按钮
- Modify: `apps/web/messages/en.json` + `zh.json` — i18n

**API 变更:**

- formatSchema: `z.enum(["json", "csv", "pdf", "txf"])`
- switch case "txf":
  ```typescript
  case "txf": {
    const txf = form8949ToTxf(report);
    reply.header("Content-Type", "text/plain");
    reply.header("Content-Disposition", `attachment; filename="form8949-${year}.txf"`);
    return reply.send(txf);
  }
  ```

**前端变更:**

- Tax Report 页面已有 CSV 和 PDF 下载按钮，新增 TXF 按钮
- 按钮文字: "TXF (TurboTax)" / "TXF (TurboTax)"
- 调用 `/tax/form8949?year=X&method=Y&format=txf`

**测试:**

- 1 route test: `GET /tax/form8949?format=txf` 返回 text/plain + .txf 文件名
