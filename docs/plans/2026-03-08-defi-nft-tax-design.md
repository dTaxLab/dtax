# DeFi/DEX/NFT 税务支持设计文档

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 扩展 DTax 税务引擎以支持 DeFi（去中心化金融）、DEX（去中心化交易所）和 NFT 交易的税务计算。

**Architecture:** 在现有三侧交易模型（sent/received/fee）基础上扩展，新增 DeFi 特定交易类型和元数据字段，保持向后兼容。

**Tech Stack:** TypeScript, Prisma, Vitest, 现有 tax-engine 包

---

## 法规背景（2025-2026 IRS/国会决策）

### 关键法规时间线

| 生效日期   | 法规                                                 | 影响                                                   |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------ |
| 2025.1.1   | IRS 最终规则：逐钱包/逐账户成本基础追踪              | DTax 已实现（Task J: wallet-siloed strict cost basis） |
| 2025.1.1   | Form 1099-DA 启动（仅 gross proceeds）               | DTax 已实现（1099-DA reconciliation）                  |
| 2025.4.10  | **国会废除 DeFi 券商报告义务**（特朗普签署）         | DeFi 平台无需提交 1099-DA                              |
| 2026.1.1   | 1099-DA 必须包含 cost basis（covered securities）    | DTax Form 8949 Box A-F 已就绪                          |
| 2024.12.31 | Rev. Proc. 2024-28 截止：跨钱包 basis 重分配窗口关闭 | 用户锁定在当前分配                                     |

### 核心法规要点

1. **DeFi 报告豁免**：国会两党通过法案废除了 IRS 对 DeFi 平台的券商报告义务。CEX（中心化交易所）仍须报告。这意味着 DeFi 用户**完全依赖自行追踪**成本基础 — 这是 DTax 的核心市场机会。

2. **仅 FIFO 和 Specific ID**：IRS 最终规则仅允许 FIFO 和 Specific Identification（§1.1012-1(c)）。DTax 的 LIFO/HIFO 在法律上属于 Specific Identification 的子类型，需在 UI 中明确标注。

3. **De Minimis 阈值**：
   - Stablecoin 交易：年 < $10,000 免报告
   - Specified NFT：年 < $600 免报告

4. **Noncovered Securities**：2026 年前获取的、或跨平台转移的数字资产为 noncovered，用户自行负责 basis 追踪。

### 对 DTax 的战略意义

- DeFi 用户是最需要税务软件的群体（无 1099-DA）
- 链上数据解析能力 = 核心竞争壁垒
- wallet-siloed 架构已合规 IRS 最终规则

---

## 现有架构评估

### 已有能力（无需修改）

| 能力                   | 现有实现                           | 备注              |
| ---------------------- | ---------------------------------- | ----------------- |
| DEX 代币交换           | `TRADE` 类型（sent/received 双侧） | 完全适用          |
| Wallet-siloed 成本基础 | `sourceId` + `strictSilo` 模式     | IRS 2025 合规     |
| 内部转账匹配           | `matchInternalTransfers()`         | 跨钱包 basis 传递 |
| 1099-DA 对账           | 3-phase reconciliation engine      | 可扩展至 DeFi     |
| 多资产费用             | `feeAsset/feeAmount/feeValueUsd`   | Gas 费直接适用    |

### 需要扩展的部分

1. **交易类型**：新增 DeFi/NFT 特定类型
2. **元数据字段**：协议名、合约地址、token ID 等
3. **CSV/链上解析器**：Etherscan、协议专用格式
4. **税务规则**：LP 提供流动性的成本基础分配、NFT 作为收藏品税率

---

## Phase 7A：DeFi 交易类型扩展

### 新增 TxType 枚举值

```typescript
// 在 Prisma schema 的 TxType enum 中新增：
DEX_SWAP; // DEX 代币交换（语义等同 TRADE，但标记来源为 DEX）
LP_DEPOSIT; // 向流动性池存入代币
LP_WITHDRAWAL; // 从流动性池取出代币
LP_REWARD; // 流动性挖矿奖励
WRAP; // 包装代币（ETH → WETH）
UNWRAP; // 解包装代币（WETH → ETH）
BRIDGE_OUT; // 跨链桥转出
BRIDGE_IN; // 跨链桥转入
CONTRACT_APPROVAL; // 合约授权（gas 费用，无税务事件）
NFT_MINT; // NFT 铸造
NFT_PURCHASE; // NFT 购买
NFT_SALE; // NFT 出售

// 在 shared-types TxType 中同步新增
// 在 parsers/types.ts ParsedTransaction.type 中同步新增
```

### 税务处理规则

| 类型              | 税务事件？   | 处理方式                                                       |
| ----------------- | ------------ | -------------------------------------------------------------- |
| DEX_SWAP          | 是           | 等同 TRADE，sent 侧为 disposal，received 侧创建新 lot          |
| LP_DEPOSIT        | 是（有争议） | 保守处理：视为 disposal of deposited tokens，创建 LP token lot |
| LP_WITHDRAWAL     | 是           | LP token disposal，创建取回的 token lots                       |
| LP_REWARD         | 是（收入）   | FMV 在收到时作为普通收入，创建新 lot                           |
| WRAP/UNWRAP       | 否           | 不触发税务事件，basis 1:1 传递（like-kind within same asset）  |
| BRIDGE_OUT/IN     | 否           | 类似 TRANSFER，basis 传递（可能有 gas 费加入 basis）           |
| CONTRACT_APPROVAL | 否           | 仅 gas 费用，可选计入后续交易的 basis                          |
| NFT_MINT          | 视情况       | 如支付 ETH 铸造 → 创建 NFT lot（cost basis = ETH 支出 + gas）  |
| NFT_PURCHASE      | 是           | 支付代币的 disposal + 创建 NFT lot                             |
| NFT_SALE          | 是           | NFT lot disposal，proceeds = 收到的代币 FMV                    |

### Schema 扩展

```prisma
// Transaction model 新增可选字段（使用 rawData JSON 字段存储，无需 schema migration）：
// rawData.defi = {
//   protocol: string       // "uniswap_v3", "aave_v3", "opensea"
//   contractAddress: string
//   chainId: number        // 1=Ethereum, 137=Polygon, etc.
//   poolAddress?: string   // LP pool 地址
//   tokenId?: string       // NFT token ID
//   collectionAddress?: string  // NFT collection 合约
//   methodName?: string    // "swap", "addLiquidity", "mint"
// }
```

**设计决策**：使用现有 `rawData` JSON 字段存储 DeFi 元数据，避免 schema 破坏性迁移。前端/API 通过类型化接口访问 `rawData.defi`。

---

## Phase 7B：Etherscan CSV 解析器

### 目标

支持从 Etherscan（及兼容区块浏览器：Polygonscan、Arbiscan 等）导出的 CSV 文件。

### Etherscan CSV 格式

```csv
"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(ETH)","Value_OUT(ETH)","CurrentValue @ $xxx","TxnFee(ETH)","TxnFee(USD)","Historical $Price/Eth","Status","ErrCode"
```

还有 ERC-20 Token 转账格式：

```csv
"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","Value","TokenName","TokenSymbol","TokenDecimal"
```

### 解析策略

1. 检测 CSV 格式（普通交易 vs ERC-20 vs ERC-721/1155）
2. 按 Txhash 分组同一交易的多行
3. 分析 From/To 地址确定方向：
   - From=用户钱包 → sent 侧
   - To=用户钱包 → received 侧
4. 已知合约地址映射到协议名（Uniswap Router、OpenSea 等）
5. 交叉关联 ETH 转账 + ERC-20 转账还原完整交易

### 实现文件

```
packages/tax-engine/src/parsers/etherscan.ts       // 主解析器
packages/tax-engine/src/__tests__/csv-etherscan.test.ts  // 测试
```

---

## Phase 7C：WRAP/UNWRAP 和 BRIDGE 非课税事件处理

### 税务引擎扩展

在 `calculator.ts` 中，WRAP/UNWRAP 和 BRIDGE_OUT/BRIDGE_IN 需要特殊处理：

1. **WRAP/UNWRAP**：不创建 TaxableEvent，直接更新 lot 的 asset 字段（ETH → WETH 或反之），保留原始 basis 和 acquiredAt
2. **BRIDGE**：类似 INTERNAL_TRANSFER，使用现有 `matchInternalTransfers()` 逻辑，额外在 basis 中加入 bridge gas 费

### 成本基础传递规则

```typescript
// WRAP: ETH lot → WETH lot（same basis, same acquiredAt）
// UNWRAP: WETH lot → ETH lot（same basis, same acquiredAt）
// BRIDGE_OUT + BRIDGE_IN: basis 传递 + gas 费加入新 lot 的 basis
```

---

## Phase 7D：LP（流动性提供）税务计算

### IRS 立场（当前指南）

IRS 尚未发布 LP 专门指南。保守立场：

- 向池子存入代币 = disposal（触发资本利得/损失）
- 获得的 LP token = 新 lot（basis = 存入代币的 FMV）
- 从池子取回 = LP token disposal + 新 lots 创建
- LP 奖励 = 普通收入（收到时的 FMV）

### 实现方式

LP_DEPOSIT 和 LP_WITHDRAWAL 作为特殊的 TRADE 处理：

- LP_DEPOSIT：sent 侧 = 存入的代币（disposal），received 侧 = LP token
- LP_WITHDRAWAL：sent 侧 = LP token（disposal），received 侧 = 取回的代币
- 税务引擎使用现有 TRADE 处理逻辑，无需额外计算器

---

## Phase 7E：NFT 税务支持

### IRS 立场

- NFT 可能被视为「收藏品」（collectible），长期资本利得税率最高 28%（vs 普通加密资产的 20%）
- IRS Notice 2023-27 定义了 NFT 作为收藏品的条件
- De minimis: Specified NFT 年交易 < $600 免报告

### 实现方式

1. NFT 使用 `rawData.defi.tokenId` + `rawData.defi.collectionAddress` 标识
2. NFT_PURCHASE 创建 lot 时，`asset` 字段格式：`NFT:{collection}:{tokenId}`（如 `NFT:BAYC:1234`）
3. NFT_SALE 匹配特定 NFT lot 进行 disposal
4. 在 Form 8949 生成时，NFT 交易标记为潜在收藏品（用户自行确认税率）

### Schema 考虑

NFT 的唯一性（每个 token ID 不同）与 fungible token 的批量 lot 管理不同。设计选择：

- 每个 NFT = 一个独立 TaxLot（amount = 1）
- `asset` 编码包含 collection + tokenId
- 支持按 collection 聚合查看

---

## 实施优先级

基于市场影响和技术依赖：

| 优先级 | 任务                                                  | 预估复杂度 | 依赖      |
| ------ | ----------------------------------------------------- | ---------- | --------- |
| P0     | 新增 TxType 枚举值（schema + shared-types + parsers） | 低         | 无        |
| P0     | WRAP/UNWRAP 非课税处理                                | 中         | P0 枚举   |
| P1     | Etherscan CSV 解析器                                  | 高         | P0 枚举   |
| P1     | BRIDGE 非课税处理（复用 transfer matcher）            | 中         | P0 枚举   |
| P2     | LP_DEPOSIT/LP_WITHDRAWAL 税务处理                     | 中         | P0 枚举   |
| P2     | NFT 交易类型 + lot 管理                               | 高         | P0 枚举   |
| P3     | UI：DeFi 交易分类标签 + 协议图标                      | 中         | P1 解析器 |
| P3     | UI：NFT 画廊视图 + 成本基础追踪                       | 高         | P2 NFT    |

---

## 合规注意事项

1. **LIFO/HIFO 标注**：在税务报告 UI 中说明 LIFO/HIFO 属于 IRS Specific Identification 方法的具体实现，需要用户保留充分记录
2. **DeFi 无 1099-DA**：提醒用户 DeFi 交易不会收到券商税务表格，DTax 的计算是其唯一记录
3. **NFT 收藏品税率**：在 Form 8949 输出中标注 NFT 交易可能适用 28% 收藏品税率
4. **Stablecoin de minimis**：未来可添加年度汇总检查，低于 $10,000 的 stablecoin 交易标记为可能免报告
