# Phase F: AI 核心引擎 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 集成 Claude API 实现交易智能分类 + 构建 Pre-Audit 风险扫描器，形成 DTax AI 差异化核心竞争力

**Architecture:**

- Claude API strict tool use 约束输出为 TxType 枚举，100% 类型安全
- 模型路由: 简单 CEX → Haiku $1/M, 复杂 DeFi → Sonnet $3/M
- Prisma schema 已有 aiClassified/aiConfidence/originalType 字段（零 migration）
- 1099-DA 对账引擎为 Pre-Audit Sandbox 提供 80% 基础

**Tech Stack:** @anthropic-ai/sdk, Claude Haiku 4.5 + Sonnet 4.6, prompt caching, Prisma, Fastify

---

## 现有基础设施审计

### 已就位 ✅

- **Prisma schema**: `aiClassified Boolean`, `aiConfidence Float?`, `originalType String?` — 零 migration
- **TxType 枚举**: 28 种类型（shared-types），覆盖 CEX/DeFi/NFT/Bridge 全场景
- **1099-DA 对账**: 3 阶段匹配 + 7 种 MatchStatus + rebuttal 生成器
- **Import 管道**: `import.ts` L223 `type: tx.type` — AI 插入点明确
- **Config 模式**: `config.ts` 已有 env var 加载模式，扩展简单

### 需要构建 🔨

- F1: AI 分类服务（Claude SDK + strict tool use + 模型路由）
- F2: Import-time AI 分类 + 批量重分类 API
- F3: 分类审核前端 UI
- F4: Pre-Audit 风险扫描器

---

## Task F1: AI Classification Service

**目标**: 创建核心 AI 分类服务，封装 Claude API 调用逻辑

**Files:**

- Create: `apps/api/src/lib/ai-classifier.ts`
- Modify: `apps/api/src/config.ts` (添加 ANTHROPIC_API_KEY)
- Modify: `apps/api/package.json` (添加 @anthropic-ai/sdk)
- Test: `apps/api/src/__tests__/ai-classifier.test.ts`

### Step 1: 安装 @anthropic-ai/sdk

```bash
cd apps/api && pnpm add @anthropic-ai/sdk
```

### Step 2: 扩展 config.ts

在 config 对象中添加:

```typescript
anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
```

### Step 3: 创建 ai-classifier.ts

核心设计:

- **strict tool use**: 定义 `classify_transaction` tool，output schema 为 TxType enum
- **模型路由**:
  - 简单模式 (BUY/SELL/TRANSFER): `claude-haiku-4-5-20251001` (~$0.00025/tx)
  - 复杂 DeFi/NFT: `claude-sonnet-4-6` (~$0.003/tx)
- **prompt caching**: 系统提示用 cache_control `ephemeral` 标记
- **graceful degradation**: 无 API key → 跳过 AI，保持 UNKNOWN

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { TxType } from "@dtax/shared-types";
import { config } from "../config";

// 模型路由常量
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

// 简单 CEX 类型列表 — 用 Haiku 即可
const SIMPLE_INDICATORS = new Set([
  "buy",
  "sell",
  "trade",
  "deposit",
  "withdrawal",
  "send",
  "receive",
]);

// TxType 枚举值列表（strict tool use enum 约束）
const TX_TYPE_ENUM: TxType[] = [
  "BUY",
  "SELL",
  "TRADE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "GIFT_RECEIVED",
  "GIFT_SENT",
  "LOST",
  "STOLEN",
  "FORK",
  "MARGIN_TRADE",
  "LIQUIDATION",
  "INTERNAL_TRANSFER",
  "DEX_SWAP",
  "LP_DEPOSIT",
  "LP_WITHDRAWAL",
  "LP_REWARD",
  "WRAP",
  "UNWRAP",
  "BRIDGE_OUT",
  "BRIDGE_IN",
  "CONTRACT_APPROVAL",
  "NFT_MINT",
  "NFT_PURCHASE",
  "NFT_SALE",
  "UNKNOWN",
];

export interface ClassificationInput {
  type: string; // 当前类型（可能是 UNKNOWN）
  sentAsset?: string;
  sentAmount?: number;
  receivedAsset?: string;
  receivedAmount?: number;
  feeAsset?: string;
  feeAmount?: number;
  notes?: string;
  source?: string; // 数据来源 (e.g., "etherscan", "coinbase")
  rawData?: Record<string, unknown>;
}

export interface ClassificationResult {
  classifiedType: TxType;
  confidence: number; // 0-1
  reasoning: string;
  model: string;
}

// classify_transaction tool definition for strict tool use
const CLASSIFY_TOOL = {
  name: "classify_transaction",
  description:
    "Classify a cryptocurrency transaction into its correct tax type",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: TX_TYPE_ENUM,
        description: "The classified transaction type",
      },
      confidence: {
        type: "number",
        description: "Confidence score 0.0-1.0",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of classification logic",
      },
    },
    required: ["type", "confidence", "reasoning"],
  },
};

const SYSTEM_PROMPT = `You are a cryptocurrency tax classification expert. Given transaction data, classify it into the correct tax type.

Rules:
- BUY: Fiat → crypto acquisition
- SELL: Crypto → fiat disposal
- TRADE: Crypto → crypto exchange (taxable)
- DEX_SWAP: Decentralized exchange swap (taxable, like TRADE)
- TRANSFER_IN/OUT: Moving assets between own wallets (not taxable)
- INTERNAL_TRANSFER: Confirmed transfer between own accounts
- WRAP/UNWRAP: Token wrapping (e.g., ETH→WETH, not taxable)
- BRIDGE_OUT/BRIDGE_IN: Cross-chain bridge (not taxable if same asset)
- LP_DEPOSIT: Adding liquidity to a pool
- LP_WITHDRAWAL: Removing liquidity from a pool
- LP_REWARD: Liquidity provider reward (income)
- STAKING_REWARD: Staking income
- MINING_REWARD: Mining income
- AIRDROP: Free token distribution (income at FMV)
- INTEREST: Interest income from lending
- NFT_MINT: Minting an NFT
- NFT_PURCHASE: Buying an NFT
- NFT_SALE: Selling an NFT
- CONTRACT_APPROVAL: Token approval (not taxable, no amount)
- MARGIN_TRADE: Margin/leveraged trade
- LIQUIDATION: Forced liquidation
- GIFT_RECEIVED/GIFT_SENT: Gift transfer
- LOST/STOLEN: Lost or stolen assets
- FORK: Blockchain fork (income)
- UNKNOWN: Cannot determine with confidence

Key indicators:
- WETH/WBTC/stETH wrapping: WRAP/UNWRAP, not TRADE
- Same asset in/out with different chains: BRIDGE
- approve() function call: CONTRACT_APPROVAL
- Zero or dust amounts with contract interaction: likely CONTRACT_APPROVAL
- LP tokens received after deposit: LP_DEPOSIT
- Reward/yield tokens: check source for staking vs LP vs interest`;

function isSimpleTransaction(input: ClassificationInput): boolean {
  const notes = (input.notes || "").toLowerCase();
  const source = (input.source || "").toLowerCase();
  // CEX sources are typically simpler
  if (
    ["coinbase", "binance", "kraken", "gemini", "kucoin"].some((s) =>
      source.includes(s),
    )
  )
    return true;
  // Check notes for simple indicators
  return SIMPLE_INDICATORS.has(notes.split(" ")[0] || "");
}

function formatTransactionForPrompt(input: ClassificationInput): string {
  const parts: string[] = [];
  parts.push(`Current type: ${input.type}`);
  if (input.source) parts.push(`Source: ${input.source}`);
  if (input.sentAsset)
    parts.push(`Sent: ${input.sentAmount} ${input.sentAsset}`);
  if (input.receivedAsset)
    parts.push(`Received: ${input.receivedAmount} ${input.receivedAsset}`);
  if (input.feeAsset) parts.push(`Fee: ${input.feeAmount} ${input.feeAsset}`);
  if (input.notes) parts.push(`Notes: ${input.notes}`);
  if (input.rawData) {
    const raw = JSON.stringify(input.rawData).slice(0, 500);
    parts.push(`Raw data: ${raw}`);
  }
  return parts.join("\n");
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export async function classifyTransaction(
  input: ClassificationInput,
): Promise<ClassificationResult | null> {
  const anthropic = getClient();
  if (!anthropic) return null; // No API key → skip AI

  const model = isSimpleTransaction(input) ? HAIKU_MODEL : SONNET_MODEL;
  const userMessage = formatTransactionForPrompt(input);

  const response = await anthropic.messages.create({
    model,
    max_tokens: 300,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_transaction" },
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract tool use result
  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return null;
  }

  const result = toolBlock.input as {
    type: TxType;
    confidence: number;
    reasoning: string;
  };

  return {
    classifiedType: result.type,
    confidence: Math.min(1, Math.max(0, result.confidence)),
    reasoning: result.reasoning,
    model,
  };
}

export async function classifyBatch(
  inputs: ClassificationInput[],
): Promise<(ClassificationResult | null)[]> {
  // 串行处理，每个请求间 50ms 延迟避免速率限制
  const results: (ClassificationResult | null)[] = [];
  for (const input of inputs) {
    results.push(await classifyTransaction(input));
    if (inputs.length > 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return results;
}
```

### Step 4: 编写单元测试

`apps/api/src/__tests__/ai-classifier.test.ts`:

- Mock @anthropic-ai/sdk
- 测试 1: 无 API key → 返回 null（graceful degradation）
- 测试 2: 有 API key + CEX 交易 → 使用 Haiku 模型
- 测试 3: 有 API key + DeFi 交易 → 使用 Sonnet 模型
- 测试 4: strict tool use 正确解析 tool_use block
- 测试 5: confidence clamp 到 [0, 1] 范围
- 测试 6: classifyBatch 批量处理
- 测试 7: formatTransactionForPrompt 正确格式化
- 测试 8: isSimpleTransaction 路由逻辑

### Step 5: 运行测试

```bash
cd apps/api && pnpm vitest run src/__tests__/ai-classifier.test.ts
```

### Step 6: tsc --noEmit

```bash
cd apps/api && npx tsc --noEmit
```

### Step 7: Commit

```bash
git add apps/api/src/lib/ai-classifier.ts apps/api/src/__tests__/ai-classifier.test.ts apps/api/src/config.ts apps/api/package.json apps/api/pnpm-lock.yaml
git commit -m "feat(api): add AI classification service with Claude API strict tool use"
```

---

## Task F2: Import-time AI Classification + Batch Reclassify API

**目标**: UNKNOWN 类型交易导入时自动 AI 分类 + 提供批量重分类端点

**Files:**

- Modify: `apps/api/src/routes/import.ts` (导入后 AI 分类)
- Create: `apps/api/src/routes/ai-classify.ts` (批量重分类 API)
- Modify: `apps/api/src/index.ts` (注册新路由)
- Test: `apps/api/src/__tests__/ai-classify.test.ts`

### Step 1: 修改 import.ts — 导入后 AI 分类

在 `createMany` 之后（L238-240），对 UNKNOWN 类型交易调用 AI:

```typescript
// After bulk insert, AI-classify UNKNOWN transactions
const unknownTxs = await prisma.transaction.findMany({
  where: {
    userId: request.userId,
    sourceId: dataSource.id,
    type: "UNKNOWN",
  },
});

if (unknownTxs.length > 0) {
  const inputs = unknownTxs.map((tx) => ({
    type: tx.type,
    sentAsset: tx.sentAsset || undefined,
    sentAmount: tx.sentAmount ? Number(tx.sentAmount) : undefined,
    receivedAsset: tx.receivedAsset || undefined,
    receivedAmount: tx.receivedAmount ? Number(tx.receivedAmount) : undefined,
    feeAsset: tx.feeAsset || undefined,
    feeAmount: tx.feeAmount ? Number(tx.feeAmount) : undefined,
    notes: tx.notes || undefined,
    source: parseResult.summary.format,
  }));

  const results = await classifyBatch(inputs);
  let aiClassifiedCount = 0;

  for (let i = 0; i < unknownTxs.length; i++) {
    const r = results[i];
    if (r && r.classifiedType !== "UNKNOWN") {
      await prisma.transaction.update({
        where: { id: unknownTxs[i].id },
        data: {
          originalType: unknownTxs[i].type,
          type: r.classifiedType,
          aiClassified: true,
          aiConfidence: r.confidence,
        },
      });
      aiClassifiedCount++;
    }
  }

  // 在响应中包含 AI 分类统计
  // imported response 中添加 aiClassified 字段
}
```

### Step 2: 创建 ai-classify.ts 批量重分类路由

```
POST /transactions/ai-classify       — 按 ID 批量 AI 分类
POST /transactions/ai-classify-all   — 重分类所有 UNKNOWN 类型
GET  /transactions/ai-stats          — AI 分类统计
```

关键逻辑:

- `ai-classify`: 接收 `{ ids: string[] }`，最大 100 条
- `ai-classify-all`: 查找用户所有 UNKNOWN 交易，批量处理
- `ai-stats`: 返回 `{ total, aiClassified, unknownCount, byConfidence }`
- 所有端点需认证 (request.userId)
- 无 ANTHROPIC_API_KEY 时返回 503 `AI_NOT_CONFIGURED`

### Step 3: 注册路由到 index.ts

```typescript
import { aiClassifyRoutes } from "./routes/ai-classify";
app.register(aiClassifyRoutes, { prefix: "/api/v1" });
```

### Step 4: 编写测试

- 测试 1: POST /ai-classify 成功分类 UNKNOWN → BUY
- 测试 2: POST /ai-classify 无 API key → 503
- 测试 3: POST /ai-classify-all 批量处理
- 测试 4: GET /ai-stats 返回正确统计
- 测试 5: import.ts UNKNOWN 自动 AI 分类（集成）

### Step 5: 运行测试 + tsc

```bash
cd apps/api && pnpm vitest run src/__tests__/ai-classify.test.ts
cd apps/api && npx tsc --noEmit
```

### Step 6: Commit

```bash
git commit -m "feat(api): add import-time AI classification and batch reclassify endpoints"
```

---

## Task F3: AI Classification Review UI

**目标**: 前端展示 AI 分类结果，允许用户一键确认/修正

**Files:**

- Create: `apps/web/src/app/[locale]/transactions/ai-review.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/page.tsx` (添加 AI review 入口)
- Modify: `apps/web/messages/en.json` + `zh.json` (i18n)

### Step 1: AI Review 组件

设计要点:

- 筛选 `aiClassified === true` 的交易
- 显示: 原始类型 → AI 分类类型 + 置信度条
- 置信度颜色: ≥0.9 绿色, 0.7-0.9 黄色, <0.7 红色
- 操作按钮: ✓ 确认 (保持 AI 分类) / ✏️ 修正 (下拉选择正确类型)
- 批量操作: 全部确认高置信度 (≥0.9)
- 确认后: `aiConfidence` 设为 1.0，标记为用户验证

### Step 2: Transactions 页面集成

- 在 TransactionTable 上方添加提示横幅:
  "X 笔交易已由 AI 分类，等待您的审核" → 链接到 AI Review 视图
- 仅当有未确认 AI 分类时显示

### Step 3: API Client 函数

```typescript
// lib/api.ts 中添加
export async function confirmAiClassification(id: string): Promise<void>;
export async function correctClassification(
  id: string,
  type: TxType,
): Promise<void>;
export async function bulkConfirmHighConfidence(): Promise<{
  confirmed: number;
}>;
```

### Step 4: i18n

EN/ZH 各约 15 个键:

- aiReview.title, aiReview.pending, aiReview.confidence
- aiReview.confirm, aiReview.correct, aiReview.bulkConfirm
- aiReview.originalType, aiReview.aiType, aiReview.noReview

### Step 5: 运行 next build

```bash
cd apps/web && npx next build
```

### Step 6: Commit

```bash
git commit -m "feat(web): add AI classification review UI with confidence display"
```

---

## Task F4: Pre-Audit Risk Scanner

**目标**: 扩展 1099-DA 对账引擎为 Pre-Audit 风险扫描器，提供可视化风险仪表板

**Files:**

- Create: `packages/tax-engine/src/risk-scanner.ts`
- Create: `apps/api/src/routes/risk-scan.ts`
- Create: `apps/web/src/app/[locale]/tax/risk-scan.tsx`
- Test: `packages/tax-engine/src/__tests__/risk-scanner.test.ts`
- Modify: `apps/web/messages/en.json` + `zh.json`

### Step 1: Risk Scanner 引擎

基于现有 reconciliation 引擎，扩展风险维度:

```typescript
export interface RiskItem {
  category: RiskCategory;
  severity: "high" | "medium" | "low";
  description: string;
  affectedTransactions: string[]; // Transaction IDs
  suggestedAction: string;
  potentialTaxImpact: number; // USD 金额
}

export type RiskCategory =
  | "missing_cost_basis" // 缺失成本基础
  | "wash_sale_risk" // 洗售风险
  | "unreported_income" // 未报告收入
  | "transfer_misclassification" // 转账误分类
  | "high_value_unverified" // 高价值未验证交易
  | "ai_low_confidence" // AI 低置信度分类
  | "duplicate_suspicious" // 可疑重复
  | "1099da_mismatch"; // 1099-DA 不匹配

export interface RiskReport {
  taxYear: number;
  generatedAt: Date;
  overallScore: number; // 0-100, 100 = 无风险
  items: RiskItem[];
  summary: {
    high: number;
    medium: number;
    low: number;
    totalPotentialImpact: number;
  };
}
```

扫描逻辑:

1. **缺失成本基础**: 扫描 SELL/TRADE 无对应 lot 的交易
2. **洗售风险**: 复用 wash-sale detector，标记 30 天内回购
3. **未报告收入**: 检查 STAKING_REWARD/AIRDROP 等无 USD 价值
4. **转账误分类**: 用 transfer matcher 检测可能的内部转账
5. **高价值未验证**: >$10,000 的 AI 分类交易且 confidence <0.9
6. **AI 低置信度**: confidence <0.7 的 AI 分类
7. **可疑重复**: 相同金额/资产/时间的交易
8. **1099-DA 不匹配**: 复用 reconciler 结果

### Step 2: 评分算法

```
overallScore = 100 - (high * 15 + medium * 5 + low * 1)
// Clamped to [0, 100]
```

### Step 3: API 路由

```
POST /tax/risk-scan     — 运行风险扫描 (参数: year, method)
GET  /tax/risk-report   — 获取最近扫描报告
```

### Step 4: 前端风险仪表板

- 整体风险分数 (圆形进度条，颜色编码)
- 按严重程度分组的风险列表
- 每项风险可展开查看受影响交易
- "修复" 按钮链接到相关交易/设置
- 扫描触发按钮 + 加载状态

### Step 5: 测试

Risk Scanner 引擎测试:

- 测试 1: 无风险场景 → score 100
- 测试 2: 缺失成本基础检测
- 测试 3: 洗售风险标记
- 测试 4: AI 低置信度检测
- 测试 5: 评分算法正确性
- 测试 6: 综合场景多风险叠加

### Step 6: 运行全部测试 + build

```bash
pnpm -r run test
cd apps/api && npx tsc --noEmit
cd apps/web && npx next build
```

### Step 7: Commit

```bash
git commit -m "feat: add Pre-Audit Risk Scanner with visual dashboard"
```

---

## 五步审计检查点

每个 Task 完成后执行:

1. **Code 审计**: tsc --noEmit + vitest + next build
2. **Business 审计**: AI 分类是否为 PRO 功能？免费用户是否有降级体验？
3. **Bias 审计**: 是否过度依赖 AI？用户是否有完全手动控制权？
4. **Historical 审计**: 与竞品对比 — Koinly 无 AI，CoinTracker 仅规则，DTax AI+人工审核
5. **Path Dependency**: AI 服务不可用时，所有功能是否仍正常工作？

---

## 执行顺序

```
F1 (AI Service) → F2 (Import + API) → F3 (Review UI) → F4 (Risk Scanner)
```

每个 Task 完成后: 五步审计 → 修复 → commit → push 三仓库 → 更新 MEMORY.md
