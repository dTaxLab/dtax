# Production Blockers 修复计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 4 个生产上线阻断问题 — 钱包同步、交易所同步、CPA 邀请邮件、API 热重载端口冲突。

**Architecture:** 在现有路由 stub 中接入已实现的底层库（索引器、CCXT、邮件），无需新增依赖或基础设施。同步操作直接在请求中执行（MVP），后续可迁移到 job queue。

**Tech Stack:** Fastify, Prisma, CCXT, Etherscan/Solscan indexers, Resend email, tsx watch

---

## Priority Order

| #   | Task                                     | Impact    | Area |
| --- | ---------------------------------------- | --------- | ---- |
| 1   | Wallet sync: 调用区块链索引器 + 写入交易 | Critical  | API  |
| 2   | Exchange sync: 调用 CCXT + 写入交易      | Critical  | API  |
| 3   | CPA client invite: 发送邀请邮件          | Critical  | API  |
| 4   | API dev server: 修复 EADDRINUSE 热重载   | Important | DX   |

---

### Task 1: Wallet Sync — 调用区块链索引器 + 写入交易

**Files:**

- Modify: `apps/api/src/routes/wallets.ts`

**Step 1: 在 sync 端点中导入索引器并实现同步逻辑**

替换当前 stub（lines 231-275），实现真正的同步：

```typescript
import { fetchEtherscanTransactions } from "../lib/blockchain/etherscan-indexer";
import { fetchSolscanTransactions } from "../lib/blockchain/solscan-indexer";
import { config } from "../config";
```

在 sync handler 中：

1. 从 DataSource.config 解析 address 和 chain
2. 根据 chain 调用对应索引器：
   - EVM 链 (ethereum/polygon/bsc/arbitrum/optimism) → `fetchEtherscanTransactions({ address, apiKey: config.etherscanApiKey, chain })`
   - Solana → `fetchSolscanTransactions({ address, apiKey: config.solscanApiKey })`
3. 去重：用 `externalId` (tx hash) 检查已存在的交易
4. 将 NormalizedBlockchainTx 转换为 Transaction 记录：
   - `type`: 映射 TRANSFER_IN/TRANSFER_OUT/CONTRACT_CALL → TxType
   - `timestamp`: 直接使用
   - `sentAsset`/`receivedAsset`: 根据 chain 设置原生代币 (ETH/MATIC/BNB/SOL 等)
   - `sentAmount`/`receivedAmount`: Wei/Lamports → 标准单位 (÷ 10^18 或 10^9)
   - `feeAsset`/`feeAmount`: gas fee 转换
   - `externalId`: tx hash
   - `sourceId`: DataSource.id
   - `rawData`: 存储原始响应
5. 用 `prisma.transaction.createMany()` 批量插入
6. 更新 `lastSyncAt` + 返回同步结果（新增交易数）

**Step 2: 五步法审计**

---

### Task 2: Exchange Sync — 调用 CCXT + 写入交易

**Files:**

- Modify: `apps/api/src/routes/connections.ts`
- Modify: `apps/api/src/services/ccxt.ts` (可选：改进多交易对支持)

**Step 1: 在 sync 端点中导入 CCXT 并实现同步**

替换当前 stub（lines 274-318）：

1. 从 DataSource.config 解密获取 exchangeId + credentials
2. 调用 `CcxtService.fetchMyTrades(exchangeId, creds, request.log)`
3. 去重：用 `externalId` (trade ID) 检查已存在
4. 将 CCXT Trade 转换为 Transaction 记录：
   - `type`: side === 'buy' → BUY, side === 'sell' → SELL
   - `timestamp`: 从 trade.timestamp (ms)
   - 对于 BUY (如 BTC/USDT): `receivedAsset` = BTC, `receivedAmount` = amount, `sentAsset` = USDT, `sentAmount` = cost
   - 对于 SELL: 反过来
   - `feeAsset` = trade.fee.currency, `feeAmount` = trade.fee.cost
   - `externalId`: trade.id
   - `sourceId`: DataSource.id
5. 批量插入 + 更新 `lastSyncAt`

**Step 2: 五步法审计**

---

### Task 3: CPA Client Invite — 发送邀请邮件

**Files:**

- Modify: `apps/api/src/routes/clients.ts`
- Modify: `apps/api/src/lib/email.ts` (添加邀请邮件模板)

**Step 1: 创建邀请邮件模板**

在 `email.ts` 中添加：

```typescript
export function clientInviteEmail(
  inviteUrl: string,
  cpaName: string,
): { subject: string; html: string } {
  return {
    subject: "You've been invited to DTax",
    html: `<p>${cpaName} has invited you to manage your crypto taxes on DTax.</p>
           <p><a href="${inviteUrl}">Accept Invitation</a></p>
           <p>This link expires in 7 days.</p>`,
  };
}
```

**Step 2: 在 invite handler 中调用 sendEmail**

在 `clients.ts` 的 invite handler（line 176 前）添加：

```typescript
import { sendEmail, clientInviteEmail } from "../lib/email";

// After creating client record:
const inviteUrl = `${config.webUrl}/auth/invite?token=${inviteToken}`;
const cpaUser = await prisma.user.findUnique({ where: { id: request.userId } });
const emailContent = clientInviteEmail(inviteUrl, cpaUser?.name || "Your CPA");
await sendEmail({ to: email, ...emailContent });
```

**Step 3: 五步法审计**

---

### Task 4: API Dev Server — 修复 EADDRINUSE 热重载

**Files:**

- Modify: `apps/api/package.json`

**Step 1: 给 tsx watch 添加 --clear-screen=false 和 SIGTERM 处理改进**

`tsx watch` 发送 SIGTERM 但不等旧进程退出。改用 `--kill-signal=SIGTERM` 确保正确信号传递，并在 index.ts 中缩短 shutdown 超时：

方案：在 package.json 中改为 `tsx watch --clear-screen=false src/index.ts`

同时在 index.ts 的 shutdown 中加 `setTimeout(() => process.exit(0), 3000)` 作为兜底，防止 graceful shutdown 卡死。

**Step 2: 五步法审计**

---

## Execution Notes

- Task 1-2 是核心阻断（用户看到假同步）
- Task 3 是 CPA 功能必需
- Task 4 是开发体验改进
- 每个 task 完成后五步法：tsc → tests → build → commit → push
