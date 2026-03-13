# DeFi 钱包直连 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持用户输入钱包地址自动拉取链上交易历史，替代手动导入 Etherscan/Solscan CSV。支持 Ethereum 和 Solana 两条链，未来可扩展。

**Architecture:** 后端新增 Blockchain Indexer Service，通过公共 API（Etherscan API / Solscan API）按地址拉取交易。定时同步机制。前端在 Onboarding 和 Settings 中添加"Connect Wallet"入口。不需要钱包签名授权（只读地址）。

**Tech Stack:** Etherscan API, Solscan API, Prisma (DataSource 复用), Fastify, Next.js

---

### Task 1: Blockchain Indexer Service — Etherscan

**Files:**

- Create: `apps/api/src/lib/blockchain/etherscan-indexer.ts`
- Test: `apps/api/src/__tests__/etherscan-indexer.test.ts`

**Step 1: Write the failing test**

```typescript
describe("Etherscan Indexer", () => {
  it("should fetch normal transactions for an address", async () => {
    const txs = await fetchEtherscanTransactions({
      address: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe", // Ethereum Foundation
      apiKey: process.env.ETHERSCAN_API_KEY || "",
      startBlock: 0,
    });
    expect(Array.isArray(txs)).toBe(true);
    if (txs.length > 0) {
      expect(txs[0]).toHaveProperty("hash");
      expect(txs[0]).toHaveProperty("from");
      expect(txs[0]).toHaveProperty("to");
      expect(txs[0]).toHaveProperty("value");
    }
  });

  it("should normalize Etherscan txs to Transaction format", async () => {
    const rawTx = {
      /* mock etherscan response */
    };
    const normalized = normalizeEtherscanTx(rawTx, "0xabc...");
    expect(normalized.type).toBeDefined();
    expect(normalized.timestamp).toBeInstanceOf(Date);
    expect(normalized.sentAsset || normalized.receivedAsset).toBeDefined();
  });

  it("should handle rate limiting gracefully", async () => {
    // Mock 429 response
    const result = await fetchEtherscanTransactions({
      address: "0x...",
      apiKey: "",
    });
    // Should return empty or throw with retry info
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

```typescript
// apps/api/src/lib/blockchain/etherscan-indexer.ts

interface EtherscanConfig {
  address: string;
  apiKey: string;
  startBlock?: number;
  chain?: "ethereum" | "polygon" | "bsc" | "arbitrum" | "optimism";
}

const CHAIN_URLS: Record<string, string> = {
  ethereum: "https://api.etherscan.io/api",
  polygon: "https://api.polygonscan.com/api",
  bsc: "https://api.bscscan.com/api",
  arbitrum: "https://api.arbiscan.io/api",
  optimism: "https://api-optimistic.etherscan.io/api",
};

export async function fetchEtherscanTransactions(config: EtherscanConfig) {
  const baseUrl = CHAIN_URLS[config.chain || "ethereum"];
  // Fetch normal txs + internal txs + ERC20 transfers
  // Normalize to Transaction format
  // Deduplicate by hash
  // Return sorted by timestamp
}

export function normalizeEtherscanTx(
  raw: EtherscanRawTx,
  userAddress: string,
): NormalizedTx {
  // Determine type: TRANSFER_IN/OUT, DEX_SWAP, etc.
  // Calculate USD values (from gas price * gas used for fees)
  // Map to shared Transaction type
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add apps/api/src/lib/blockchain/
git commit -m "feat(api): add Etherscan blockchain indexer service"
```

---

### Task 2: Blockchain Indexer Service — Solscan

**Files:**

- Create: `apps/api/src/lib/blockchain/solscan-indexer.ts`
- Test: `apps/api/src/__tests__/solscan-indexer.test.ts`

**Step 1: Write tests (similar structure to Etherscan)**

**Step 2: Implement Solscan API integration**

Solscan API endpoints:

- `/account/transactions` — SOL transactions
- `/account/splTransfers` — SPL token transfers
- `/account/defiActivities` — DeFi activities

**Step 3: Commit**

```bash
git add apps/api/src/lib/blockchain/solscan-indexer.ts apps/api/src/__tests__/solscan-indexer.test.ts
git commit -m "feat(api): add Solscan blockchain indexer service"
```

---

### Task 3: Wallet Connection API Routes

**Files:**

- Create: `apps/api/src/routes/wallets.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/wallets.test.ts`

**Step 1: Write tests**

```typescript
describe("Wallet Routes", () => {
  describe("POST /wallets/connect", () => {
    it("should create blockchain data source and start sync", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets/connect",
        payload: {
          address: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe",
          chain: "ethereum",
          label: "My Main Wallet",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.dataSourceId).toBeDefined();
    });

    it("should validate wallet address format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets/connect",
        payload: { address: "invalid", chain: "ethereum" },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /wallets/:id/sync", () => {
    it("should trigger incremental sync", async () => {
      // ...
    });
  });

  describe("GET /wallets", () => {
    it("should list connected wallets", async () => {
      // ...
    });
  });

  describe("DELETE /wallets/:id", () => {
    it("should disconnect wallet and optionally delete transactions", async () => {
      // ...
    });
  });
});
```

**Step 2: Implement endpoints**

- `POST /wallets/connect` — 验证地址格式 → 创建 DataSource (type=BLOCKCHAIN) → 触发首次同步
- `POST /wallets/:id/sync` — 增量同步（从上次同步的 block 开始）
- `GET /wallets` — 列出已连接钱包
- `DELETE /wallets/:id` — 断开连接

**Step 3: Commit**

```bash
git add apps/api/src/routes/wallets.ts apps/api/src/__tests__/wallets.test.ts apps/api/src/index.ts
git commit -m "feat(api): add wallet connection API routes"
```

---

### Task 4: Address Validation Utility

**Files:**

- Create: `apps/api/src/lib/blockchain/address-validator.ts`
- Test: `apps/api/src/__tests__/address-validator.test.ts`

**Step 1: Write tests**

```typescript
describe("Address Validator", () => {
  it("should validate Ethereum address", () => {
    expect(
      isValidAddress("0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe", "ethereum"),
    ).toBe(true);
    expect(isValidAddress("invalid", "ethereum")).toBe(false);
  });

  it("should validate Solana address", () => {
    expect(
      isValidAddress("So11111111111111111111111111111111111111112", "solana"),
    ).toBe(true);
    expect(isValidAddress("invalid", "solana")).toBe(false);
  });
});
```

**Step 2: Implement — regex + checksum validation**

**Step 3: Commit**

---

### Task 5: 环境变量 & Config 更新

**Files:**

- Modify: `apps/api/src/config.ts`
- Modify: `.env.example`

添加:

```
ETHERSCAN_API_KEY=
SOLSCAN_API_KEY=
```

graceful degradation: 未配置时返回 503 "Blockchain indexer not configured"

---

### Task 6: Web API Client & i18n

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/messages/en.json` / `zh.json`

**Step 1: API 函数**

```typescript
export async function connectWallet(
  address: string,
  chain: string,
  label?: string,
) {
  /* ... */
}
export async function listWallets() {
  /* ... */
}
export async function syncWallet(id: string) {
  /* ... */
}
export async function disconnectWallet(id: string) {
  /* ... */
}
```

**Step 2: i18n**

```json
"wallets": {
  "title": "Connected Wallets",
  "connect": "Connect Wallet",
  "address": "Wallet Address",
  "chain": "Blockchain",
  "label": "Label (optional)",
  "ethereum": "Ethereum",
  "solana": "Solana",
  "polygon": "Polygon",
  "syncing": "Syncing...",
  "lastSync": "Last synced",
  "sync": "Sync Now",
  "disconnect": "Disconnect",
  "disconnectConfirm": "Disconnect this wallet? Imported transactions will be kept.",
  "invalidAddress": "Invalid wallet address",
  "connected": "Wallet connected! Syncing transactions...",
  "txFound": "{count} transactions found"
}
```

---

### Task 7: Wallet Connection UI — Settings 页面

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx`

在 Data Sources 区域添加 "Connected Wallets" 子区:

- 已连接钱包列表（地址缩写、链标识、交易数、最后同步时间）
- "Connect Wallet" 按钮 → 模态框：选择链 → 输入地址 → 可选 label → Connect
- "Sync" 按钮（增量同步）
- "Disconnect" 按钮

---

### Task 8: Onboarding 集成

**Files:**

- Modify: `apps/web/src/app/[locale]/onboarding/page.tsx`

在 Step 3 (Import Method) 中添加第四个选项:

- "Connect Wallet Address" — 输入钱包地址直接索引链上数据

---

### Task 9-11: 定时同步 + 多链扩展 + 五步法审计

**Task 9:** 可选定时同步（每 6 小时自动增量同步已连接钱包）
**Task 10:** 扩展支持 Polygon, BSC, Arbitrum, Optimism（复用 Etherscan API 结构）
**Task 11:** 五步法审计

**审计重点:**

- 钱包地址为只读，不存储私钥
- API key 不暴露给前端
- 速率限制保护（Etherscan 5 req/sec free tier）
- 大地址（10K+ txs）使用分页处理
