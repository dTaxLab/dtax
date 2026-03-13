# CPA 多客户管理系统 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 CPA 用户能够管理多个客户的税务数据，切换客户视图，批量生成报告，解锁 $199 CPA 定价的核心价值。

**Architecture:** 新增 `Client` 模型，CPA 用户通过邀请码/邮件邀请客户。客户数据通过 `clientId` 隔离。CPA 在 Dashboard 顶部有客户切换器。所有现有路由通过可选 `clientId` query param 支持代理访问。

**Tech Stack:** Prisma (schema migration), Fastify (API routes), Next.js (client switcher UI), Resend (邀请邮件)

---

### Task 1: Prisma Schema — Client & CpaAccess 模型

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

**Step 1: Write the migration schema**

在 `schema.prisma` 中添加:

```prisma
model Client {
  id          String   @id @default(uuid())
  email       String
  name        String?
  cpaUserId   String
  cpaUser     User     @relation("CpaClients", fields: [cpaUserId], references: [id])
  userId      String?  @unique
  user        User?    @relation("ClientUser", fields: [userId], references: [id])
  status      ClientStatus @default(PENDING)
  inviteToken String?  @unique
  inviteExpiresAt DateTime?
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([cpaUserId])
  @@index([email])
}

enum ClientStatus {
  PENDING
  ACTIVE
  REVOKED
}
```

在 `User` 模型中添加关系:

```prisma
cpaClients    Client[] @relation("CpaClients")
clientOf      Client?  @relation("ClientUser")
```

**Step 2: Run migration**

Run: `cd apps/api && npx prisma migrate dev --name add-client-model`
Expected: Migration created and applied successfully

**Step 3: Verify schema**

Run: `cd apps/api && npx prisma generate`
Expected: Prisma Client generated

**Step 4: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(db): add Client model for CPA multi-client management"
```

---

### Task 2: CPA Guard Middleware

**Files:**

- Create: `apps/api/src/plugins/cpa-guard.ts`
- Test: `apps/api/src/__tests__/cpa-guard.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/__tests__/cpa-guard.test.ts
import { describe, it, expect, vi } from "vitest";

describe("CPA Guard", () => {
  it("should reject non-CPA users from client management", async () => {
    // Mock user with FREE plan trying to access client routes
    const result = await checkCpaAccess("user-free-id");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("CPA_PLAN_REQUIRED");
  });

  it("should allow CPA users to manage clients", async () => {
    const result = await checkCpaAccess("user-cpa-id");
    expect(result.allowed).toBe(true);
  });

  it("should verify CPA owns the client", async () => {
    const result = await verifyCpaClientAccess("cpa-user-id", "client-id");
    expect(result.allowed).toBe(true);
  });

  it("should reject CPA accessing another CPA's client", async () => {
    const result = await verifyCpaClientAccess("other-cpa-id", "client-id");
    expect(result.allowed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/cpa-guard.test.ts`
Expected: FAIL — functions not found

**Step 3: Write minimal implementation**

```typescript
// apps/api/src/plugins/cpa-guard.ts
import { prisma } from "../lib/prisma.js";

export async function checkCpaAccess(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!subscription || subscription.plan !== "CPA") {
    return { allowed: false, reason: "CPA_PLAN_REQUIRED" };
  }
  return { allowed: true };
}

export async function verifyCpaClientAccess(
  cpaUserId: string,
  clientId: string,
): Promise<{ allowed: boolean; clientUserId?: string }> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, cpaUserId, status: "ACTIVE" },
  });
  if (!client || !client.userId) {
    return { allowed: false };
  }
  return { allowed: true, clientUserId: client.userId };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/cpa-guard.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/plugins/cpa-guard.ts apps/api/src/__tests__/cpa-guard.test.ts
git commit -m "feat(api): add CPA guard middleware for client access control"
```

---

### Task 3: Client Management API Routes

**Files:**

- Create: `apps/api/src/routes/clients.ts`
- Modify: `apps/api/src/index.ts` (register route)
- Test: `apps/api/src/__tests__/clients.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/clients.test.ts
describe("Client Routes", () => {
  describe("POST /clients/invite", () => {
    it("should create a pending client with invite token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/invite",
        payload: { email: "client@example.com", name: "Test Client" },
        headers: { authorization: `Bearer ${cpaToken}` },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.status).toBe("PENDING");
      expect(res.json().data.inviteToken).toBeDefined();
    });

    it("should reject non-CPA users", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/invite",
        payload: { email: "client@example.com" },
        headers: { authorization: `Bearer ${freeToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /clients", () => {
    it("should list CPA's clients", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/clients",
        headers: { authorization: `Bearer ${cpaToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });
  });

  describe("POST /clients/accept", () => {
    it("should accept invite and link client user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/clients/accept",
        payload: { inviteToken: "valid-token" },
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("ACTIVE");
    });
  });

  describe("DELETE /clients/:id", () => {
    it("should revoke client access", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/clients/client-id",
        headers: { authorization: `Bearer ${cpaToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/clients.test.ts`
Expected: FAIL

**Step 3: Write implementation**

在 `apps/api/src/routes/clients.ts` 实现以下端点:

- `POST /clients/invite` — 创建邀请，发送邮件（使用 Resend）
- `GET /clients` — 列出 CPA 的所有客户
- `GET /clients/:id` — 客户详情（含交易统计）
- `POST /clients/accept` — 客户接受邀请
- `DELETE /clients/:id` — 撤销客户访问
- `PUT /clients/:id` — 更新客户备注

在 `apps/api/src/index.ts` 注册路由:

```typescript
import { clientRoutes } from "./routes/clients.js";
await app.register(clientRoutes, { prefix: "/api/v1" });
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/clients.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/clients.ts apps/api/src/__tests__/clients.test.ts apps/api/src/index.ts
git commit -m "feat(api): add client management routes for CPA multi-client"
```

---

### Task 4: Proxy Access — 修改现有路由支持 clientId

**Files:**

- Modify: `apps/api/src/routes/transactions.ts`
- Modify: `apps/api/src/routes/tax.ts`
- Modify: `apps/api/src/routes/portfolio.ts`
- Modify: `apps/api/src/routes/transfers.ts`
- Create: `apps/api/src/plugins/resolve-user.ts`

**Step 1: Write the failing test**

```typescript
// 在 routes.test.ts 中添加
describe("CPA Proxy Access", () => {
  it("should allow CPA to view client transactions via ?clientId=", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/transactions?clientId=${clientId}`,
      headers: { authorization: `Bearer ${cpaToken}` },
    });
    expect(res.statusCode).toBe(200);
    // Should return CLIENT's transactions, not CPA's own
  });

  it("should reject proxy access for non-CPA users", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/transactions?clientId=${clientId}`,
      headers: { authorization: `Bearer ${freeToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/routes.test.ts -t "CPA Proxy"`
Expected: FAIL

**Step 3: Write resolveUser plugin**

```typescript
// apps/api/src/plugins/resolve-user.ts
import { FastifyRequest } from "fastify";
import { verifyCpaClientAccess } from "./cpa-guard.js";

/**
 * 解析实际操作的 userId：
 * - 如果请求含 clientId query param，验证 CPA 权限后返回客户的 userId
 * - 否则返回请求者自己的 userId
 */
export async function resolveUserId(request: FastifyRequest): Promise<string> {
  const clientId = (request.query as Record<string, string>).clientId;
  if (!clientId) return request.userId;

  const result = await verifyCpaClientAccess(request.userId, clientId);
  if (!result.allowed || !result.clientUserId) {
    throw { statusCode: 403, message: "No access to this client" };
  }
  return result.clientUserId;
}
```

然后在 transactions.ts, tax.ts, portfolio.ts, transfers.ts 的每个 handler 中将 `request.userId` 替换为 `await resolveUserId(request)`。

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/routes.test.ts`
Expected: PASS (all existing + new proxy tests)

**Step 5: Commit**

```bash
git add apps/api/src/plugins/resolve-user.ts apps/api/src/routes/
git commit -m "feat(api): add CPA proxy access via clientId query parameter"
```

---

### Task 5: OpenAPI Schema 补全 — clients 路由

**Files:**

- Modify: `apps/api/src/routes/clients.ts` (添加 schema 对象)

**Step 1: 为所有 clients 端点添加 OpenAPI schema**

参考现有路由（如 `auth.ts`）的 schema 模式，为每个端点添加 `tags`, `summary`, `body`, `response` 定义。

**Step 2: 验证 Swagger 文档可访问**

Run: `curl http://localhost:3001/docs/json | jq '.paths["/api/v1/clients"]'`
Expected: 返回 clients 路由的 OpenAPI 定义

**Step 3: Commit**

```bash
git add apps/api/src/routes/clients.ts
git commit -m "docs(api): add OpenAPI schemas to client management routes"
```

---

### Task 6: Web API Client — 客户管理函数

**Files:**

- Modify: `apps/web/src/lib/api.ts`

**Step 1: 添加客户管理 API 函数**

```typescript
// 在 api.ts 末尾添加

// ── Client Management (CPA) ──
export async function inviteClient(email: string, name?: string) {
  return apiFetch<{ id: string; inviteToken: string; status: string }>(
    "/clients/invite",
    { method: "POST", body: JSON.stringify({ email, name }) },
  );
}

export async function listClients() {
  return apiFetch<
    Array<{
      id: string;
      email: string;
      name: string | null;
      status: string;
      userId: string | null;
      createdAt: string;
      transactionCount?: number;
    }>
  >("/clients");
}

export async function getClient(clientId: string) {
  return apiFetch<{
    id: string;
    email: string;
    name: string | null;
    status: string;
    notes: string | null;
    taxSummary?: { year: number; netGainLoss: number };
  }>(`/clients/${clientId}`);
}

export async function revokeClient(clientId: string) {
  return apiFetch<{ success: boolean }>(`/clients/${clientId}`, {
    method: "DELETE",
  });
}

export async function updateClientNotes(clientId: string, notes: string) {
  return apiFetch<{ success: boolean }>(`/clients/${clientId}`, {
    method: "PUT",
    body: JSON.stringify({ notes }),
  });
}

export async function acceptClientInvite(inviteToken: string) {
  return apiFetch<{ status: string }>("/clients/accept", {
    method: "POST",
    body: JSON.stringify({ inviteToken }),
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add client management API functions"
```

---

### Task 7: i18n — 客户管理翻译

**Files:**

- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`

**Step 1: 添加 "clients" 命名空间**

EN:

```json
"clients": {
  "title": "Client Management",
  "invite": "Invite Client",
  "email": "Client Email",
  "name": "Client Name",
  "notes": "Notes",
  "status": "Status",
  "pending": "Pending",
  "active": "Active",
  "revoked": "Revoked",
  "inviteSent": "Invitation sent successfully",
  "revokeConfirm": "Are you sure you want to revoke access for this client?",
  "revoked": "Client access revoked",
  "noClients": "No clients yet. Invite your first client to get started.",
  "switchTo": "Switch to",
  "viewingAs": "Viewing as",
  "backToOwn": "Back to my account",
  "transactions": "Transactions",
  "taxSummary": "Tax Summary",
  "batchReport": "Generate Batch Reports"
}
```

ZH: (对应中文翻译)

**Step 2: 验证 key 对称**

Run: `node -e "const en=require('./messages/en.json'); const zh=require('./messages/zh.json'); console.log('EN keys:', Object.keys(en).length, 'ZH keys:', Object.keys(zh).length)"`
Expected: 数量相同

**Step 3: Commit**

```bash
git add apps/web/messages/
git commit -m "feat(i18n): add client management translations (EN/ZH)"
```

---

### Task 8: Client Switcher 组件

**Files:**

- Create: `apps/web/src/app/[locale]/client-switcher.tsx`

**Step 1: 实现客户切换器**

```typescript
"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { listClients } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Client { id: string; email: string; name: string | null; status: string; }

export function ClientSwitcher() {
  const t = useTranslations("clients");
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // CPA plan check — render nothing if not CPA
  // Fetch clients on mount
  // Store activeClientId in localStorage + URL search params
  // Provide context to child routes via ClientContext

  return (
    <div className="client-switcher">
      {activeClientId && (
        <div className="client-banner">
          {t("viewingAs")}: {clients.find(c => c.id === activeClientId)?.name}
          <button onClick={() => setActiveClientId(null)}>{t("backToOwn")}</button>
        </div>
      )}
      {/* Dropdown to select client */}
    </div>
  );
}
```

**Step 2: 将 ClientSwitcher 集成到 layout.tsx**

在 `<LocaleNav />` 之后添加 `<ClientSwitcher />`（仅 CPA 用户可见）。

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/client-switcher.tsx apps/web/src/app/[locale]/layout.tsx
git commit -m "feat(web): add CPA client switcher component"
```

---

### Task 9: Client Context Provider

**Files:**

- Create: `apps/web/src/lib/client-context.tsx`
- Modify: `apps/web/src/lib/api.ts` (注入 clientId)

**Step 1: 创建 ClientContext**

```typescript
"use client";
import { createContext, useContext, useState } from "react";

interface ClientContextType {
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
}

const ClientContext = createContext<ClientContextType>({
  activeClientId: null,
  setActiveClientId: () => {},
});

export const useClient = () => useContext(ClientContext);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [activeClientId, setActiveClientId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("dtax_active_client") : null
  );

  const setClient = (id: string | null) => {
    setActiveClientId(id);
    if (id) localStorage.setItem("dtax_active_client", id);
    else localStorage.removeItem("dtax_active_client");
  };

  return (
    <ClientContext.Provider value={{ activeClientId, setActiveClientId: setClient }}>
      {children}
    </ClientContext.Provider>
  );
}
```

**Step 2: 修改 apiFetch 自动注入 clientId**

在 `api.ts` 的 `apiFetch` 函数中：

```typescript
// 读取 activeClientId 并追加到 URL
const clientId =
  typeof window !== "undefined"
    ? localStorage.getItem("dtax_active_client")
    : null;
if (clientId) {
  const separator = url.includes("?") ? "&" : "?";
  url = `${url}${separator}clientId=${clientId}`;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/client-context.tsx apps/web/src/lib/api.ts
git commit -m "feat(web): add ClientContext and auto-inject clientId into API calls"
```

---

### Task 10: Client Management Page

**Files:**

- Create: `apps/web/src/app/[locale]/clients/page.tsx`
- Modify: `apps/web/src/app/[locale]/nav.tsx` (添加 CPA 导航链接)

**Step 1: 实现客户管理页面**

包含：

- 客户列表（表格：名称、邮箱、状态、交易数、创建时间）
- 邀请客户按钮 + 模态框
- 撤销/恢复客户访问
- 客户备注编辑
- 批量报告生成按钮
- 点击客户切换到代理视图

**Step 2: 在 nav.tsx 中为 CPA 添加 "Clients" 链接**

在 admin link 附近添加（仅 CPA plan 可见）。

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/clients/ apps/web/src/app/[locale]/nav.tsx
git commit -m "feat(web): add CPA client management page with invite/list/revoke"
```

---

### Task 11: Batch Report Generation

**Files:**

- Modify: `apps/api/src/routes/clients.ts` (添加 batch endpoint)
- Modify: `apps/web/src/app/[locale]/clients/page.tsx`

**Step 1: 添加批量报告 API**

`POST /clients/batch-report`:

- 接收 `clientIds[]`, `taxYear`, `method`
- 为每个客户调用 tax engine 生成 Form 8949
- 返回打包下载 URL 或逐个结果

**Step 2: 前端批量报告 UI**

- 勾选多个客户 → "Generate Reports" 按钮
- 进度条显示（SSE 或轮询）
- 下载 ZIP 包

**Step 3: Commit**

```bash
git add apps/api/src/routes/clients.ts apps/web/src/app/[locale]/clients/
git commit -m "feat: add batch report generation for CPA multi-client"
```

---

### Task 12: 五步法审计

**Step 1: 类型安全审计**

Run: `pnpm -r exec tsc --noEmit`
Expected: 0 errors

**Step 2: 测试回归审计**

Run: `pnpm test`
Expected: 所有测试通过（原有 977+ 加新增 client 测试）

**Step 3: 安全合规审计**

- 验证 CPA 只能访问自己的客户数据
- 验证邀请 token 有过期时间
- 验证 clientId injection 不能绕过权限

**Step 4: i18n 完整性审计**

Run: 对比 `messages/en.json` 和 `messages/zh.json` 的 clients 命名空间

**Step 5: 构建部署审计**

Run: `pnpm build`
Expected: 所有 packages 和 apps 构建成功
