# Phase H: 竞品数据迁移 — Koinly & CoinTracker CSV 解析器

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持从 Koinly 和 CoinTracker 导入交易历史，降低竞品用户迁移成本

**Architecture:**

- 两个独立解析器：`koinly.ts` + `cointracker.ts`，遵循现有 parser 模式
- Koinly: 12列格式（Sent/Received Amount/Currency, Fee, Net Worth, Label, TxHash）
- CoinTracker: 8列固定格式（Received/Sent Quantity/Currency, Fee, Tag），类型通过数据推断
- 注册到 `index.ts` 检测链 + `types.ts` CsvFormat union + 前端导入选项

**Tech Stack:** csv-core helpers, Vitest, 现有 parser 基础设施

---

## Task H1: Koinly CSV 解析器

**Files:**

- Create: `packages/tax-engine/src/parsers/koinly.ts`
- Test: `packages/tax-engine/src/__tests__/csv-koinly.test.ts`

Koinly 导出格式（通用模板）：

```
Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash
2025-01-15 10:30:00,0.5,BTC,,,0.0001,BTC,21000,USD,gift,,abc123
2025-02-01 14:00:00,1000,USDT,0.5,ETH,2.5,USDT,1000,USD,,,def456
```

**检测逻辑：** 列头同时包含 `sent amount`、`sent currency`、`received amount`、`received currency` 和 `net worth amount`（`net worth amount` 是 Koinly 特有列，与 Generic 区分）

**Label → TxType 映射：**

| Koinly Label                         | DTax TxType                                          |
| ------------------------------------ | ---------------------------------------------------- |
| (空) + 仅 Received                   | BUY (若 Sent Currency 为法币) 或 TRANSFER_IN         |
| (空) + 仅 Sent                       | SELL (若 Received Currency 为法币) 或 TRANSFER_OUT   |
| (空) + 双边                          | TRADE                                                |
| `airdrop`                            | AIRDROP                                              |
| `staking`, `reward`                  | STAKING_REWARD                                       |
| `mining`                             | MINING_REWARD                                        |
| `lending interest`                   | INTEREST                                             |
| `income`, `salary`, `cashback`       | INTEREST（归入收入类）                               |
| `gift` (deposit)                     | GIFT_RECEIVED                                        |
| `gift` (withdrawal)                  | GIFT_SENT                                            |
| `lost`                               | TRANSFER_OUT（notes 标注 lost）                      |
| `donation`                           | TRANSFER_OUT（notes 标注 donation）                  |
| `fork`                               | AIRDROP（hard fork 按收入处理）                      |
| `swap`                               | TRADE（Koinly 的 swap 标签表示免税交换，notes 标注） |
| `stake` (deposit)                    | TRANSFER_OUT（notes: staking deposit）               |
| `stake` (withdrawal)                 | TRANSFER_IN（notes: staking withdrawal）             |
| `loan`, `margin loan`                | TRANSFER_IN（notes 标注）                            |
| `loan repayment`, `margin repayment` | TRANSFER_OUT（notes 标注）                           |
| `cost`, `loan fee`, `margin fee`     | TRANSFER_OUT（notes 标注）                           |
| `realized gain`                      | UNKNOWN（期货/合约 P&L 需人工审核）                  |
| `fee refund`                         | TRANSFER_IN（notes: fee refund）                     |

**Net Worth 处理：** `Net Worth Amount` + `Net Worth Currency` → 若 Currency 为 USD，映射到 `sentValueUsd`/`receivedValueUsd`

**测试用例（≥20）：**

1. `isKoinlyCsv` — 检测 Koinly 格式
2. `isKoinlyCsv` — 拒绝 Generic 格式（无 net worth amount）
3. `isKoinlyCsv` — 拒绝 CoinTracker 格式
4. `detectCsvFormat` — 自动检测 Koinly
5. 买入交易（仅 Received + 法币 Sent）
6. 卖出交易（仅 Sent + 法币 Received）
7. 双边交易（crypto-to-crypto → TRADE）
8. `airdrop` label → AIRDROP
9. `staking` label → STAKING_REWARD
10. `reward` label → STAKING_REWARD
11. `mining` label → MINING_REWARD
12. `lending interest` label → INTEREST
13. `gift` label on deposit → GIFT_RECEIVED
14. `gift` label on withdrawal → GIFT_SENT
15. `lost` label → TRANSFER_OUT with notes
16. `swap` label → TRADE with notes
17. `fork` label → AIRDROP
18. Net Worth USD 映射到 valueUsd
19. Fee Amount/Currency 正确解析
20. TxHash 映射到 notes
21. 空行和无效行跳过
22. 日期格式解析（YYYY-MM-DD HH:mm:ss UTC）
23. 仅 Sent（无 label）→ TRANSFER_OUT
24. 仅 Received（无 label）→ TRANSFER_IN

## Task H2: CoinTracker CSV 解析器

**Files:**

- Create: `packages/tax-engine/src/parsers/cointracker.ts`
- Test: `packages/tax-engine/src/__tests__/csv-cointracker.test.ts`

CoinTracker 导出格式（固定 8 列）：

```
Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Tag
01/15/2025 10:30:00,0.5,ETH,,,,,
02/01/2025 14:00:00,0.5,ETH,1000,USDT,2.5,USDT,
03/01/2025,500,SOL,,,,,airdrop
```

**检测逻辑：** 列头同时包含 `received quantity`、`received currency`、`sent quantity`、`sent currency`（`received quantity` 是 CoinTracker 特有，区别于 Koinly 的 `received amount`）

**类型推断规则（与 Tag 组合）：**

| 数据模式    | Tag        | DTax TxType                             |
| ----------- | ---------- | --------------------------------------- |
| 仅 Received | (空)       | BUY（若来源可能是法币）或 TRANSFER_IN   |
| 仅 Sent     | (空)       | SELL（若目标可能是法币）或 TRANSFER_OUT |
| 双边        | (空)       | TRADE                                   |
| 仅 Received | `staked`   | STAKING_REWARD                          |
| 仅 Received | `mined`    | MINING_REWARD                           |
| 仅 Received | `airdrop`  | AIRDROP                                 |
| 仅 Received | `fork`     | AIRDROP                                 |
| 仅 Received | `gift`     | GIFT_RECEIVED                           |
| 仅 Sent     | `gift`     | GIFT_SENT                               |
| 仅 Sent     | `lost`     | TRANSFER_OUT（notes: lost）             |
| 仅 Sent     | `donation` | TRANSFER_OUT（notes: donation）         |
| 仅 Received | `income`   | INTEREST                                |
| 任意        | `payment`  | 有 Sent → SELL, 有 Received → BUY       |

**日期格式：** `MM/DD/YYYY HH:MM:SS`（时间可选）

**法币检测：** 复用已有 FIAT_SET（USD, EUR, GBP 等），若 Sent Currency 为法币 + 有 Received → BUY

**测试用例（≥20）：**

1. `isCoinTrackerCsv` — 检测 CoinTracker 格式
2. `isCoinTrackerCsv` — 拒绝 Koinly 格式
3. `isCoinTrackerCsv` — 拒绝 Generic 格式
4. `detectCsvFormat` — 自动检测 CoinTracker
5. 买入交易（法币 Sent + crypto Received）
6. 卖出交易（crypto Sent + 法币 Received）
7. 双边交易（crypto-to-crypto → TRADE）
8. 仅 Received（无 tag）→ TRANSFER_IN
9. 仅 Sent（无 tag）→ TRANSFER_OUT
10. `staked` tag → STAKING_REWARD
11. `mined` tag → MINING_REWARD
12. `airdrop` tag → AIRDROP
13. `fork` tag → AIRDROP
14. `gift` tag on receive → GIFT_RECEIVED
15. `gift` tag on send → GIFT_SENT
16. `lost` tag → TRANSFER_OUT with notes
17. `donation` tag → TRANSFER_OUT with notes
18. `payment` tag with Sent → SELL
19. Fee Amount/Currency 正确解析
20. MM/DD/YYYY 日期格式解析
21. 仅日期无时间（MM/DD/YYYY）
22. 空行和无效行跳过

## Task H3: 注册到解析器基础设施

**Files:**

- Modify: `packages/tax-engine/src/parsers/types.ts` — 添加 `"koinly" | "cointracker"` 到 CsvFormat
- Modify: `packages/tax-engine/src/parsers/index.ts` — 导入、检测、switch、re-export
- Modify: `apps/api/src/routes/import.ts` — formatSchema 添加 koinly/cointracker
- Modify: `apps/web/src/app/[locale]/transactions/import-form.tsx` — 前端导入选项
- Modify: `apps/web/messages/en.json` + `zh.json` — i18n 标签

**检测顺序位置：** Koinly 和 CoinTracker 放在 Coinbase 之后、Kraken 之前（两者列头足够独特，不会误检测）

```typescript
// index.ts detectCsvFormat 中
if (isCoinbaseCsv(csv)) return "coinbase";
if (isKoinlyCsv(csv)) return "koinly"; // NEW
if (isCoinTrackerCsv(csv)) return "cointracker"; // NEW
if (isBinanceCsv(csv)) return "binance";
```

**前端导入选项：**

```
Koinly — "Koinly (Transaction Export)"
CoinTracker — "CoinTracker (Transaction History)"
```

## Task H4: 交叉检测集成测试

**Files:**

- Modify: `packages/tax-engine/src/__tests__/csv-cross-detect.test.ts` — 添加 Koinly/CoinTracker 到检测矩阵

新增 2 个测试验证 Koinly/CoinTracker 不互相误检测，且不被其他 20 个格式误判。
