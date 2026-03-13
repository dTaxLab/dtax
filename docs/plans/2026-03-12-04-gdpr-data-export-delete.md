# GDPR 数据导出与账户删除 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现用户数据导出（GDPR Article 20 数据可携权）和账户删除（GDPR Article 17 被遗忘权），满足 GDPR 和 CCPA 合规要求。

**Architecture:** 数据导出生成 JSON 压缩包（包含所有用户数据）。账户删除采用软删除（30天冷静期）+ 硬删除定时任务。删除前需密码确认。导出/删除操作发送确认邮件。

**Tech Stack:** Prisma (cascading queries), archiver (ZIP), Fastify (API), Resend (确认邮件)

---

### Task 1: 安装依赖

**Step 1: 安装压缩包依赖**

Run: `cd apps/api && pnpm add archiver && pnpm add -D @types/archiver`

**Step 2: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore: add archiver dependency for data export"
```

---

### Task 2: Prisma Schema — 软删除字段

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

**Step 1: 在 User 模型中添加软删除字段**

```prisma
model User {
  // ... existing fields ...
  deletedAt         DateTime?    // 软删除标记
  deletionRequestedAt DateTime?  // 删除请求时间
  deletionReason    String?      // 可选：删除原因
}
```

**Step 2: Run migration**

Run: `cd apps/api && npx prisma migrate dev --name add-user-soft-delete`

**Step 3: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(db): add soft delete fields to User model"
```

---

### Task 3: Data Export Service

**Files:**

- Create: `apps/api/src/lib/data-export.ts`
- Test: `apps/api/src/__tests__/data-export.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { generateUserDataExport } from "../lib/data-export.js";

describe("Data Export Service", () => {
  it("should include all user tables in export", async () => {
    const data = await generateUserDataExport("test-user-id");
    expect(data).toHaveProperty("user");
    expect(data).toHaveProperty("transactions");
    expect(data).toHaveProperty("taxLots");
    expect(data).toHaveProperty("taxReports");
    expect(data).toHaveProperty("dataSources");
    expect(data).toHaveProperty("subscription");
    expect(data).toHaveProperty("chatConversations");
    expect(data).toHaveProperty("exportedAt");
  });

  it("should exclude password hash and internal IDs", async () => {
    const data = await generateUserDataExport("test-user-id");
    expect(data.user.passwordHash).toBeUndefined();
    expect(data.user.totpSecret).toBeUndefined();
  });

  it("should include transaction count metadata", async () => {
    const data = await generateUserDataExport("test-user-id");
    expect(data.metadata.transactionCount).toBeDefined();
    expect(data.metadata.taxReportCount).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

```typescript
// apps/api/src/lib/data-export.ts
import { prisma } from "./prisma.js";

export async function generateUserDataExport(userId: string) {
  const [
    user,
    transactions,
    taxLots,
    taxReports,
    dataSources,
    subscription,
    conversations,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        // 排除: passwordHash, totpSecret, recoveryCodes
      },
    }),
    prisma.transaction.findMany({ where: { userId } }),
    prisma.taxLot.findMany({ where: { userId } }),
    prisma.taxReport.findMany({ where: { userId } }),
    prisma.dataSource.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
        // 排除: config (含加密 API keys)
      },
    }),
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.chatConversation.findMany({
      where: { userId },
      include: { messages: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    metadata: {
      transactionCount: transactions.length,
      taxReportCount: taxReports.length,
      dataSourceCount: dataSources.length,
    },
    user,
    transactions,
    taxLots,
    taxReports,
    dataSources,
    subscription,
    chatConversations: conversations,
  };
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add apps/api/src/lib/data-export.ts apps/api/src/__tests__/data-export.test.ts
git commit -m "feat(api): add user data export service for GDPR compliance"
```

---

### Task 4: Account Deletion Service

**Files:**

- Create: `apps/api/src/lib/account-deletion.ts`
- Test: `apps/api/src/__tests__/account-deletion.test.ts`

**Step 1: Write the failing test**

```typescript
describe("Account Deletion Service", () => {
  it("should soft-delete user and set 30-day window", async () => {
    await requestAccountDeletion("user-id", "No longer needed");
    const user = await prisma.user.findUnique({ where: { id: "user-id" } });
    expect(user?.deletedAt).toBeNull(); // 不立即删除
    expect(user?.deletionRequestedAt).toBeDefined();
  });

  it("should cancel deletion within 30-day window", async () => {
    await cancelAccountDeletion("user-id");
    const user = await prisma.user.findUnique({ where: { id: "user-id" } });
    expect(user?.deletionRequestedAt).toBeNull();
  });

  it("should hard-delete all user data after 30 days", async () => {
    await executeAccountDeletion("user-id");
    const user = await prisma.user.findUnique({ where: { id: "user-id" } });
    expect(user).toBeNull();
    const txCount = await prisma.transaction.count({
      where: { userId: "user-id" },
    });
    expect(txCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

```typescript
// apps/api/src/lib/account-deletion.ts
import { prisma } from "./prisma.js";

export async function requestAccountDeletion(
  userId: string,
  reason?: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: new Date(), deletionReason: reason },
  });
}

export async function cancelAccountDeletion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: null, deletionReason: null },
  });
}

export async function executeAccountDeletion(userId: string): Promise<void> {
  // 级联删除所有关联数据
  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { conversation: { userId } } }),
    prisma.chatConversation.deleteMany({ where: { userId } }),
    prisma.passwordReset.deleteMany({ where: { userId } }),
    prisma.taxReport.deleteMany({ where: { userId } }),
    prisma.taxLot.deleteMany({ where: { userId } }),
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.dataSource.deleteMany({ where: { userId } }),
    prisma.subscription.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

// 定时任务：清理超过 30 天的删除请求
export async function cleanupDeletedAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: cutoff } },
    select: { id: true },
  });
  for (const user of users) {
    await executeAccountDeletion(user.id);
  }
  return users.length;
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add apps/api/src/lib/account-deletion.ts apps/api/src/__tests__/account-deletion.test.ts
git commit -m "feat(api): add account deletion service with 30-day grace period"
```

---

### Task 5: API Routes — 数据导出 & 账户删除

**Files:**

- Create: `apps/api/src/routes/account.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/account.test.ts`

**Step 1: Write the failing tests**

```typescript
describe("Account Routes", () => {
  describe("POST /account/export", () => {
    it("should return ZIP file with user data", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/export",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });
  });

  describe("POST /account/delete", () => {
    it("should require password confirmation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/delete",
        payload: { password: "wrong" },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("should initiate deletion with correct password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/delete",
        payload: { password: "correct", reason: "testing" },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.deletionScheduledAt).toBeDefined();
    });
  });

  describe("POST /account/cancel-deletion", () => {
    it("should cancel pending deletion", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/account/cancel-deletion",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
```

**Step 2-4: Implement and test**

**Step 5: Commit**

```bash
git add apps/api/src/routes/account.ts apps/api/src/__tests__/account.test.ts apps/api/src/index.ts
git commit -m "feat(api): add data export and account deletion API routes"
```

---

### Task 6: Web API Client & i18n

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`

**Step 1: API 函数**

```typescript
export async function exportAccountData() {
  const res = await fetch(`${API_BASE}/api/v1/account/export`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.blob(); // 返回 ZIP blob 用于下载
}

export async function requestAccountDeletion(
  password: string,
  reason?: string,
) {
  return apiFetch<{ deletionScheduledAt: string }>("/account/delete", {
    method: "POST",
    body: JSON.stringify({ password, reason }),
  });
}

export async function cancelAccountDeletion() {
  return apiFetch<{ cancelled: boolean }>("/account/cancel-deletion", {
    method: "POST",
  });
}
```

**Step 2: i18n 翻译**

```json
"account": {
  "exportData": "Export My Data",
  "exportDescription": "Download all your data in JSON format",
  "exportProcessing": "Preparing your data...",
  "deleteAccount": "Delete Account",
  "deleteWarning": "This action will permanently delete your account and all associated data after a 30-day grace period.",
  "deleteConfirmPassword": "Enter your password to confirm",
  "deleteReason": "Reason for leaving (optional)",
  "deleteScheduled": "Account deletion scheduled. You have 30 days to cancel.",
  "cancelDeletion": "Cancel Account Deletion",
  "deletionPending": "Account deletion pending",
  "deletionDate": "Scheduled for permanent deletion on"
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/messages/
git commit -m "feat(web): add data export and account deletion API + i18n"
```

---

### Task 7: Settings UI — 数据 & 隐私区

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx`

**Step 1: 在 Settings 右侧栏添加 "Data & Privacy" 卡片**

在 Data Sources 卡片下方添加:

- **Export Data** 按钮 → 点击后下载 ZIP
- **Delete Account** 区域:
  - 红色警告框
  - 密码输入
  - 可选原因
  - "Delete My Account" 按钮（二次确认）
- 如果已请求删除:
  - 显示删除计划日期
  - "Cancel Deletion" 按钮

**Step 2: Commit**

```bash
git add apps/web/src/app/[locale]/settings/page.tsx
git commit -m "feat(web): add data export and account deletion UI to settings"
```

---

### Task 8: 五步法审计

**Step 1: 类型安全审计** — `pnpm -r exec tsc --noEmit`

**Step 2: 测试回归审计** — `pnpm test`

**Step 3: 安全合规审计**

- 数据导出必须排除密码哈希、TOTP secret、加密的 API keys
- 账户删除必须验证密码
- 级联删除必须清除所有关联表
- 导出文件不应存留在服务器

**Step 4: i18n 完整性审计** — 验证 account 命名空间

**Step 5: 构建部署审计** — `pnpm build`
