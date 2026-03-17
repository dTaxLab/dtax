# 交易所解析器多语言支持 + CSV 模板国际化

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为所有有多语言导出风险的交易所 CSV 解析器添加多语言列名支持，并改进 CSV 导入模板的国际化兼容性。

**Architecture:** 提取共享的 `col-resolver.ts` 模块（`resolveCol` + `normalizeKey`），各交易所解析器统一引用。按风险等级（高→低）逐一为每个交易所添加多语言列名映射。优化 CSV 模板以适应多国报税需求。

**Tech Stack:** TypeScript, Vitest, csv-core (parseCsvToObjects / safeParseNumber / safeParseDateToIso)

---

## 调研结论

### 各交易所 CSV 导出多语言风险评估

| 交易所               | 风险      | 证据                                             | 行动             |
| -------------------- | --------- | ------------------------------------------------ | ---------------- |
| Binance              | ✅ 已修复 | 用户实际中文文件确认                             | 已支持 11 种语言 |
| HTX Japan (BitTrade) | ⚠️ 高     | Cryptolinc 确认日文头部：時間,通貨ペア,売／買    | Task 2           |
| Crypto.com           | ⚠️ 中     | 官方文档提到非英文兼容性问题，但头部可能仍为英文 | Task 3           |
| OKX                  | ⚠️ 中     | 中国交易所，未确认本地化头部但防御性添加         | Task 4           |
| Bybit                | ⚠️ 低     | 确认始终英文头部                                 | Task 5（防御性） |
| MEXC                 | ⚠️ 低     | 文档建议「导出前设英文」                         | Task 6（防御性） |
| Bitget               | ⚠️ 低     | 确认始终英文头部                                 | Task 7（防御性） |
| Gate.io              | ⚠️ 低     | 确认始终英文头部                                 | Task 8（防御性） |
| CSV 模板             | —         | 当前仅英文格式，需国际化                         | Task 9           |

### 已确认的非英文头部

**HTX Japan (BitTrade) 日文头部（Cryptolinc 确认）：**

```
時間,通貨ペア,売／買,価格,数量,約定額,手数料
```

**Binance 中文头部（用户文件确认）：**

```
时间,交易对,基准货币,计价货币,类型,价格,数量,成交额,手续费,手续费结算币种
```

### 各交易所标准英文头部（需确保兼容）

**OKX:** `Order ID,Trade ID,Trade Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency`
**Bybit:** `Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time`
**MEXC:** `Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee`
**Bitget:** `Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time`
**Gate.io:** `No,Currency Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date`

---

## Task 1: 提取共享的 col-resolver 模块 (DRY)

**Files:**

- Create: `packages/tax-engine/src/parsers/col-resolver.ts`
- Modify: `packages/tax-engine/src/parsers/binance.ts` — 移除 normalizeKey/resolveCol，改为导入
- Test: `packages/tax-engine/src/__tests__/csv-binance.test.ts` — 确保现有测试仍通过

**Step 1: 创建 col-resolver.ts**

```typescript
/**
 * Shared column name resolver for multi-language CSV parsers.
 * Provides normalizeKey() for Unicode normalization and resolveCol()
 * for flexible column lookup across language variants.
 *
 * @license AGPL-3.0
 */

/**
 * Normalize a string for comparison: NFC normalize + strip combining marks.
 * Handles Turkish İ→i̇ (i + combining dot) and similar issues.
 */
export function normalizeKey(s: string): string {
  return s.normalize("NFC").replace(/\u0307/g, "");
}

/**
 * Find the first matching column value from a row given a list of candidate names.
 * Headers are already lowercased + trimmed by csv-core.
 * Uses Unicode normalization to handle Turkish İ and similar cases.
 */
export function resolveCol(
  row: Record<string, string>,
  candidates: string[],
): string {
  // Fast path: direct key lookup
  for (const key of candidates) {
    const val = row[key];
    if (val !== undefined && val !== "") return val;
  }
  // Slow path: normalized comparison (handles Turkish İ → i̇ etc.)
  const normalizedCandidates = candidates.map(normalizeKey);
  for (const [rowKey, rowVal] of Object.entries(row)) {
    if (!rowVal) continue;
    const nk = normalizeKey(rowKey);
    if (normalizedCandidates.includes(nk)) return rowVal;
  }
  return "";
}
```

**Step 2: 更新 binance.ts 使用共享模块**

从 `binance.ts` 中删除 `normalizeKey` 和 `resolveCol` 函数定义，替换为：

```typescript
import { normalizeKey, resolveCol } from "./col-resolver";
```

**Step 3: 运行测试验证无回归**

```bash
pnpm --filter @dtax/tax-engine exec vitest run src/__tests__/csv-binance.test.ts
```

Expected: 37 tests passing

**Step 4: 运行完整测试套件**

```bash
pnpm --filter @dtax/tax-engine exec vitest run
```

Expected: 840 tests passing

**Step 5: 五步法审计 → 提交**

```bash
pnpm --filter @dtax/tax-engine exec tsc --noEmit
pnpm --filter @dtax/tax-engine exec vitest run
pnpm --filter @dtax/tax-engine build
git add packages/tax-engine/src/parsers/col-resolver.ts packages/tax-engine/src/parsers/binance.ts
git commit -m "refactor(tax-engine): extract shared col-resolver module from Binance parser"
git push origin-private main
```

---

## Task 2: HTX 解析器添加日文头部支持

**Files:**

- Modify: `packages/tax-engine/src/parsers/htx.ts`
- Modify: `packages/tax-engine/src/__tests__/csv-htx.test.ts`

**已确认的 HTX Japan 日文头部：**

```
時間,通貨ペア,売／買,価格,数量,約定額,手数料
```

**中文预防性头部（HTX 原名火币，中国用户量大）：**

```
时间,交易对,方向,价格,数量,成交额,手续费,手续费币种
```

**Step 1: 在 htx.ts 中添加多语言列名常量和 resolveCol 引用**

```typescript
import { normalizeKey, resolveCol } from "./col-resolver";

// Multi-language column name mappings for HTX
const COL_TIME = [
  "time",
  "created-at",
  "created_at",
  "createdat",
  "timestamp",
  "date",
  "時間", // JA
  "时间", // ZH
];

const COL_PAIR = [
  "pair",
  "symbol",
  "trading pair",
  "通貨ペア",
  "ペア", // JA
  "交易对", // ZH
];

const COL_SIDE = [
  "side",
  "direction",
  "type",
  "売／買",
  "売買",
  "タイプ", // JA (売／買 is unique to BitTrade)
  "方向",
  "类型", // ZH
];

const COL_PRICE = [
  "price",
  "avg price",
  "average price",
  "価格", // JA
  "价格", // ZH
];

const COL_AMOUNT = [
  "amount",
  "filled-amount",
  "filled amount",
  "filledamount",
  "quantity",
  "qty",
  "数量", // JA / ZH
];

const COL_TOTAL = [
  "total",
  "turnover",
  "filled-cash-amount",
  "filledcashamount",
  "約定額",
  "合計", // JA
  "成交额", // ZH
];

const COL_FEE = [
  "fee",
  "filled-fees",
  "filledfees",
  "filled fees",
  "trading fee",
  "手数料", // JA
  "手续费", // ZH
];

const COL_FEE_CURRENCY = [
  "fee currency",
  "fee-deduct-currency",
  "feedeductcurrency",
  "fee ccy",
  "手数料通貨", // JA
  "手续费币种", // ZH
];
```

**Step 2: 更新 isHtxCsv 检测函数**

在现有英文检测后增加日文和中文头部组合检测：

```typescript
export function isHtxCsv(csv: string): boolean {
  const firstLine = csv.split("\n")[0]?.toLowerCase() || "";
  const normalized = normalizeKey(firstLine);

  // 现有英文检测逻辑保持不变...
  // (省略)

  // JA: HTX Japan (BitTrade) — 時間 + 通貨ペア or 売／買
  if (
    firstLine.includes("時間") &&
    (firstLine.includes("通貨ペア") || firstLine.includes("売／買"))
  ) {
    return true;
  }
  // ZH: 时间 + 交易对 + 方向
  if (
    firstLine.includes("时间") &&
    firstLine.includes("交易对") &&
    firstLine.includes("方向")
  ) {
    return true;
  }
  return false;
}
```

注意：日文检测使用原始 firstLine（未 lowercase），因为日文字符不受影响。中文同理。

**Step 3: 更新 parseTradeRow 使用 resolveCol**

将所有 `row["key"] || row["fallback"]` 替换为 `resolveCol(row, COL_*)` 调用。

**Step 4: 更新 parseSide 支持日文/中文买卖关键词**

```typescript
function parseSide(row: Record<string, string>): "buy" | "sell" | null {
  const side = resolveCol(row, COL_SIDE).toLowerCase().trim();
  if (side === "buy" || side === "sell") return side;
  // JA: 買 / 売
  if (side.includes("買") || side.includes("买")) return "buy";
  if (side.includes("売") || side.includes("卖")) return "sell";
  // API format
  const typeField = (row["type"] || "").toLowerCase().trim();
  if (typeField.startsWith("buy")) return "buy";
  if (typeField.startsWith("sell")) return "sell";
  return null;
}
```

**Step 5: 添加日文测试用例**

```typescript
describe("isHtxCsv — multi-language detection", () => {
  it("should detect Japanese BitTrade headers", () => {
    const csv = "時間,通貨ペア,売／買,価格,数量,約定額,手数料\n";
    expect(isHtxCsv(csv)).toBe(true);
  });

  it("should detect Chinese headers", () => {
    const csv = "时间,交易对,方向,价格,数量,成交额,手续费,手续费币种\n";
    expect(isHtxCsv(csv)).toBe(true);
  });
});

describe("parseHtxCsv — Japanese (BitTrade)", () => {
  const csv = `時間,通貨ペア,売／買,価格,数量,約定額,手数料
2024-06-15 10:30:00,BTC/JPY,買,10500000,0.01,105000,52.5
2024-06-16 14:00:00,ETH/JPY,売,550000,1,550000,275
`;

  it("should parse Japanese BitTrade CSV", () => {
    const result = parseHtxCsv(csv);
    expect(result.summary.parsed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("should map Japanese 買/売 to buy/sell", () => {
    const result = parseHtxCsv(csv);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[1].type).toBe("SELL");
  });
});
```

**Step 6: 五步法审计 → 提交**

```bash
pnpm --filter @dtax/tax-engine exec tsc --noEmit
pnpm --filter @dtax/tax-engine exec vitest run
pnpm --filter @dtax/tax-engine build
git add packages/tax-engine/src/parsers/htx.ts packages/tax-engine/src/__tests__/csv-htx.test.ts
git commit -m "feat(tax-engine): add Japanese/Chinese header support for HTX parser"
git push origin-private main
```

---

## Task 3: Crypto.com 解析器防御性多语言支持

**Files:**

- Modify: `packages/tax-engine/src/parsers/crypto-com.ts`
- Modify: `packages/tax-engine/src/__tests__/csv-crypto-com.test.ts`

**说明：** Crypto.com 官方建议设英文导出，但头部可能在非英文界面下本地化。添加防御性中文/日文/韩文列名映射。

**已知英文头部（App 格式）：**
`Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind`

**可能的中文头部变体：**
`时间戳 (UTC),交易描述,币种,金额,目标币种,目标金额,本地货币,本地金额,本地金额 (USD),交易类型`

**Step 1: 添加 COL\_\* 常量**

```typescript
import { resolveCol } from "./col-resolver";

const COL_TIMESTAMP = [
  "timestamp (utc)",
  "timestamp",
  "date",
  "时间戳 (utc)",
  "时间戳",
  "時間戳 (utc)", // ZH
  "タイムスタンプ (utc)",
  "日時", // JA
  "타임스탬프 (utc)",
  "날짜", // KO
];

const COL_TX_KIND = [
  "transaction kind",
  "transaction type",
  "交易类型",
  "交易類型", // ZH
  "取引種類", // JA
  "거래 유형", // KO
];

const COL_CURRENCY = [
  "currency",
  "币种",
  "幣種", // ZH
  "通貨", // JA
  "통화", // KO
];

const COL_AMOUNT = [
  "amount",
  "金额",
  "金額", // ZH
  "金額", // JA
  "금액", // KO
];

const COL_TO_CURRENCY = [
  "to currency",
  "目标币种",
  "目標幣種", // ZH
  "変換先通貨", // JA
  "대상 통화", // KO
];

const COL_TO_AMOUNT = [
  "to amount",
  "目标金额",
  "目標金額", // ZH
  "変換先金額", // JA
  "대상 금액", // KO
];

const COL_NATIVE_AMOUNT_USD = [
  "native amount (in usd)",
  "native amount in usd",
  "本地金额 (usd)",
  "本地金額 (usd)", // ZH
  "ネイティブ金額 (usd)", // JA
];
```

**Step 2: 更新 isCryptoComCsv 检测**

App 格式的关键特征是 "transaction kind" + "native amount"。添加中文/日文变体：

```typescript
// 中文: "交易类型" + "本地金额"
// 日文: "取引種類" + "ネイティブ金額"
```

**Step 3: 更新 parseCryptoComCsv 使用 resolveCol**

**Step 4: 添加中文测试用例**

**Step 5: 五步法审计 → 提交**

```bash
git commit -m "feat(tax-engine): add defensive i18n header support for Crypto.com parser"
git push origin-private main
```

---

## Task 4: OKX 解析器防御性多语言支持

**Files:**

- Modify: `packages/tax-engine/src/parsers/okx.ts`
- Modify: `packages/tax-engine/src/__tests__/csv-okx.test.ts`

**OKX 英文头部：** `Order ID,Trade ID,Trade Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency`

**防御性中文头部：**
`订单ID,交易ID,交易时间,交易对,方向,价格,数量,总额,手续费,手续费币种`

**Step 1-5:** 与 Task 2-3 相同模式。添加 COL\_\* 常量，更新检测和解析函数，添加中文测试。

**Step 6: 五步法审计 → 提交**

```bash
git commit -m "feat(tax-engine): add defensive i18n header support for OKX parser"
git push origin-private main
```

---

## Task 5: Bybit 解析器防御性多语言支持

**Files:**

- Modify: `packages/tax-engine/src/parsers/bybit.ts`
- Modify: `packages/tax-engine/src/__tests__/csv-bybit.test.ts`

**Bybit 英文头部：** `Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time`

**防御性日文头部（Bybit 日本市场）：**
`注文番号,銘柄,売買,平均約定価格,約定数量,合計,手数料,手数料通貨,注文時間`

**Step 1-5:** 同上模式。

**Step 6: 五步法审计 → 提交**

```bash
git commit -m "feat(tax-engine): add defensive i18n header support for Bybit parser"
git push origin-private main
```

---

## Task 6: MEXC 解析器防御性多语言支持

**Files:**

- Modify: `packages/tax-engine/src/parsers/mexc.ts`
- Modify: `packages/tax-engine/src/__tests__/csv-mexc.test.ts`

**MEXC 英文头部：** `Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee`

**防御性中文头部：**
`交易对,时间,方向,成交价,成交量,总额,手续费`

**Step 1-5:** 同上模式。注意 MEXC 的 `findTimeColumn()` 需要兼容中文时间列名。

**Step 6: 五步法审计 → 提交**

```bash
git commit -m "feat(tax-engine): add defensive i18n header support for MEXC parser"
git push origin-private main
```

---

## Task 7: Bitget 解析器防御性多语言支持

**Files:**

- Modify: `packages/tax-engine/src/parsers/bitget.ts`
- Modify: `packages/tax-engine/src/__tests__/csv-bitget.test.ts`

**Bitget 英文头部：** `Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time`

**防御性中文头部：**
`订单ID,交易对,方向,成交价,成交量,总额,手续费,手续费币种,下单时间`

**Step 1-5:** 同上模式。

**Step 6: 五步法审计 → 提交**

```bash
git commit -m "feat(tax-engine): add defensive i18n header support for Bitget parser"
git push origin-private main
```

---

## Task 8: Gate.io 解析器防御性多语言支持

**Files:**

- Modify: `packages/tax-engine/src/parsers/gate.ts`
- Modify: `packages/tax-engine/src/__tests__/csv-gate.test.ts`

**Gate.io 英文头部：** `No,Currency Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date`

**防御性中文头部：**
`编号,交易对,方向,角色,成交价,成交量,总额,手续费,手续费币种,日期`

**Step 1-5:** 同上模式。

**Step 6: 五步法审计 → 提交**

```bash
git commit -m "feat(tax-engine): add defensive i18n header support for Gate.io parser"
git push origin-private main
```

---

## Task 9: CSV 导入模板国际化

**Files:**

- Modify: `apps/web/public/csv-template.csv`

**当前模板：**

```csv
type,timestamp,received asset,received amount,received value usd,sent asset,sent amount,sent value usd,fee asset,fee amount,notes
BUY,2025-01-15T10:30:00Z,BTC,0.5,21500,USD,21500,,USD,10,Bought BTC on exchange
```

**分析：** 当前模板是 Generic CSV 格式（dTax 自定义），用于用户手动整理数据导入。这个格式是平台内部标准，不需要按国家税务政策调整头部列名，因为它是一个中间导入格式。

**但应该增加以下改进：**

1. 添加更多交易类型示例（STAKING_REWARD, AIRDROP, MINING_REWARD, INTEREST）
2. 添加 feeValueUsd 列（当前模板缺少）
3. 确保示例覆盖常见场景（DeFi swap、staking、airdrop）

**Step 1: 更新 CSV 模板**

```csv
type,timestamp,received asset,received amount,received value usd,sent asset,sent amount,sent value usd,fee asset,fee amount,fee value usd,notes
BUY,2025-01-15T10:30:00Z,BTC,0.5,21500,USD,21500,,USD,10,10,Bought BTC on exchange
SELL,2025-02-20T14:00:00Z,USD,15000,,BTC,0.3,15000,USD,8,8,Sold BTC
TRADE,2025-03-10T16:45:00Z,SOL,100,2500,USDT,2500,,USDT,1.5,,Swapped USDT for SOL
TRANSFER_IN,2025-03-01T09:00:00Z,ETH,2.0,6400,,,,,,, Received ETH from wallet
STAKING_REWARD,2025-04-01T00:00:00Z,DOT,5.0,35,,,,,,, Staking reward
AIRDROP,2025-05-15T12:00:00Z,ARB,500,250,,,,,,, Token airdrop
INTEREST,2025-06-01T00:00:00Z,USDC,12.5,12.5,,,,,,, Lending interest
```

**Step 2: 更新 generic.ts DEFAULT_COLUMN_MAP 添加 feeValueUsd**

确认 `generic.ts` 已包含 `feeValueUsd: "fee value usd"` 映射（当前已存在）。

**Step 3: 五步法审计 → 提交**

```bash
git commit -m "feat(web): improve CSV import template with more transaction types"
git push origin-private main
```

---

## Task 10: 集成测试 — 跨格式检测回归测试

**Files:**

- Modify: `packages/tax-engine/src/__tests__/csv-integration.test.ts`

**Step 1: 确保所有 FORMAT_HEADERS 仍然正确检测**

运行现有集成测试验证无跨格式误检测：

```bash
pnpm --filter @dtax/tax-engine exec vitest run src/__tests__/csv-integration.test.ts
```

**Step 2: 添加多语言头部的跨格式检测测试**

确保日文 HTX 头部不会被误检测为 Binance，中文 OKX 头部不会被误检测为 HTX 等。

```typescript
describe("detectCsvFormat — multi-language headers", () => {
  it("detects Japanese BitTrade as HTX", () => {
    const csv = "時間,通貨ペア,売／買,価格,数量,約定額,手数料\n";
    expect(detectCsvFormat(csv)).toBe("htx");
  });

  it("detects Chinese Binance correctly", () => {
    const csv =
      "时间,交易对,基准货币,计价货币,类型,价格,数量,成交额,手续费,手续费结算币种\n";
    expect(detectCsvFormat(csv)).toBe("binance");
  });

  // ...更多跨语言检测测试
});
```

**Step 3: 五步法审计 → 提交**

```bash
git commit -m "test(tax-engine): add multi-language cross-format detection tests"
git push origin-private main
```

---

## 执行策略

- **总计 10 个 Task**，每个 Task 完成后执行五步法审计（tsc → tests → build → commit → push）
- **Task 1 最关键** — 提取共享模块，后续所有 Task 依赖
- **Task 2 最有价值** — HTX Japan 是唯一确认有非英文头部的交易所
- **Task 3-8 防御性** — 虽然目前未确认有非英文头部，但作为中国交易所，添加防御性支持合理
- **Task 9 改进模板** — 增加交易类型示例，改善用户体验
- **Task 10 回归验证** — 确保所有变更不影响现有格式检测
