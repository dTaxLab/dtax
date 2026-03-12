# Phase D: Admin UI + Stripe 支付系统

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 DTax 添加管理后台 UI 和 Stripe 订阅支付系统，实现从免费到付费的完整转化链路。

**Architecture:** Admin UI 对接已有 API 端点；Stripe 集成采用 Checkout Session + Webhook 模式，Prisma 扩展 Subscription 模型。

**Tech Stack:** Next.js 14, Fastify, Prisma, Stripe API, @stripe/stripe-js

---

## 阶段划分

### 阶段 D1: Admin UI（纯前端，接已有 API）— 3 Tasks

### 阶段 D2: Stripe 支付后端 — 4 Tasks

### 阶段 D3: 支付前端 + 升级拦截 — 3 Tasks

---

### Task D1-1: Admin Dashboard 页面

**Files:**

- Create: `apps/web/src/app/[locale]/admin/page.tsx`
- Modify: `apps/web/messages/en.json` — 添加 `"admin"` i18n block
- Modify: `apps/web/messages/zh.json` — 添加 `"admin"` i18n block
- Modify: `apps/web/src/app/[locale]/nav.tsx` — 登录用户为 ADMIN 时显示 Admin 链接

**功能：**

- 4 个统计卡片：总用户数 / 总交易数 / 数据源数 / 税务报告数
- 调用 `GET /api/v1/admin/stats`
- 需要从 auth context 获取 user.role，非 ADMIN 显示 403 页面
- Admin 路由不加入 PUBLIC_PATHS（需要认证）

**i18n keys (~15):** adminTitle, adminStats, totalUsers, totalTransactions, totalDataSources, totalTaxReports, accessDenied, accessDeniedMsg 等

**Step 1:** 添加 i18n 消息 (EN + ZH)
**Step 2:** 创建 admin/page.tsx（fetch stats → 4 stat cards）
**Step 3:** Nav 添加 Admin 链接（仅 user.role === "ADMIN" 可见）
**Step 4:** 验证 `tsc --noEmit && next build`

---

### Task D1-2: Admin 用户管理页面

**Files:**

- Create: `apps/web/src/app/[locale]/admin/users/page.tsx`
- Modify: `apps/web/messages/en.json` — 扩展 `"admin"` i18n block
- Modify: `apps/web/messages/zh.json` — 扩展 `"admin"` i18n block

**功能：**

- 用户列表表格：email / name / role / 注册时间 / 交易数 / 数据源数
- 分页（与 transactions 页面分页模式一致）
- 搜索过滤（email 关键字，客户端过滤即可）
- 角色切换按钮（USER ↔ ADMIN，调用 PATCH /admin/users/:id/role）
- 点击用户进入详情（inline 展开或跳转）
- 需要 admin guard（非 ADMIN 显示 403）

**i18n keys (~20):** userManagement, email, name, role, registeredAt, txCount, dsCount, changeRole, confirmRoleChange, userDetail 等

**Step 1:** 添加 i18n 消息
**Step 2:** 创建 users/page.tsx（fetch user list → table + pagination + role toggle）
**Step 3:** 验证

---

### Task D1-3: Admin 导航 + Auth Context 角色传递

**Files:**

- Modify: `apps/web/src/lib/auth-context.tsx` — user 对象包含 role 字段
- Modify: `apps/web/src/app/[locale]/nav.tsx` — Admin 链接（仅 ADMIN）

**功能：**

- AuthContext 的 user 对象当前可能不含 role（需确认）
- 如不含：修改 login/register 响应或 /auth/me 返回 role，前端 AuthContext 存储
- Nav 中 `{user?.role === "ADMIN" && <Link href="/admin">Admin</Link>}`

**Step 1:** 确认 auth-context.tsx 的 user 类型，必要时扩展
**Step 2:** 确认 /auth/me API 返回 role 字段
**Step 3:** Nav 添加条件渲染 Admin 链接
**Step 4:** 验证

---

### Task D2-1: Prisma Schema 扩展 — Subscription 模型

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Run: `npx prisma migrate dev --name add_subscription`
- Modify: `packages/shared-types/src/index.ts` — 添加 Plan enum

**Prisma 新模型：**

```prisma
enum Plan {
  FREE
  PRO
  CPA
}

model Subscription {
  id                 String   @id @default(uuid())
  userId             String   @unique @map("user_id")
  user               User     @relation(fields: [userId], references: [id])
  plan               Plan     @default(FREE)
  stripeCustomerId   String?  @map("stripe_customer_id")
  stripeSubId        String?  @map("stripe_subscription_id")
  taxYear            Int?     @map("tax_year")
  status             String   @default("active") // active, canceled, past_due
  currentPeriodEnd   DateTime? @map("current_period_end")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@map("subscriptions")
}
```

User 模型扩展：

```prisma
model User {
  // ... existing fields
  subscription Subscription?
}
```

**Step 1:** 修改 schema.prisma
**Step 2:** 运行 migrate dev
**Step 3:** 更新 shared-types Plan enum
**Step 4:** 验证 tsc --noEmit

---

### Task D2-2: Stripe 集成 — Checkout + Webhook 路由

**Files:**

- Create: `apps/api/src/routes/billing.ts`
- Modify: `apps/api/src/index.ts` — 注册 billing 路由
- Modify: `apps/api/.env.example` — 添加 STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, STRIPE_CPA_PRICE_ID

**依赖：** `pnpm --filter @dtax/api add stripe`

**端点：**

| Method | Endpoint          | Auth               | 描述                                |
| ------ | ----------------- | ------------------ | ----------------------------------- |
| GET    | /billing/status   | JWT                | 获取当前订阅状态                    |
| POST   | /billing/checkout | JWT                | 创建 Stripe Checkout Session        |
| POST   | /billing/webhook  | 无(Stripe签名验证) | Stripe Webhook 回调                 |
| POST   | /billing/portal   | JWT                | 创建 Stripe Customer Portal Session |

**Checkout 流程：**

1. 前端发起 POST /billing/checkout `{ plan: "PRO" | "CPA", taxYear?: 2025 }`
2. 后端创建/获取 Stripe Customer → 创建 Checkout Session
3. 返回 `{ url: session.url }` → 前端重定向到 Stripe
4. 支付成功 → Stripe Webhook → 更新 Subscription 记录

**Webhook 事件处理：**

- `checkout.session.completed` → 创建/更新 Subscription
- `customer.subscription.updated` → 更新 status/currentPeriodEnd
- `customer.subscription.deleted` → 标记 status = "canceled"

**Step 1:** 安装 stripe 依赖
**Step 2:** 创建 billing.ts 路由
**Step 3:** 注册路由 + 更新 .env.example
**Step 4:** 验证 tsc --noEmit

---

### Task D2-3: 交易限额中间件 — 免费 50 笔限制

**Files:**

- Create: `apps/api/src/plugins/plan-guard.ts`
- Modify: `apps/api/src/routes/import.ts` — CSV 导入前检查配额
- Modify: `apps/api/src/routes/transactions.ts` — 手动添加前检查配额

**逻辑：**

```typescript
async function checkTransactionQuota(
  userId: string,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = sub?.plan ?? "FREE";
  if (plan !== "FREE") return { allowed: true, current: 0, limit: Infinity };

  const count = await prisma.transaction.count({ where: { userId } });
  return { allowed: count < 50, current: count, limit: 50 };
}
```

- 导入时：如果导入后总数超 50，拒绝并返回 `{ error: { code: "QUOTA_EXCEEDED", limit: 50, current: N } }`
- 手动添加时：同理

**Step 1:** 创建 plan-guard.ts
**Step 2:** 修改 import.ts 添加配额检查
**Step 3:** 修改 transactions.ts POST 添加配额检查
**Step 4:** 验证 + 测试

---

### Task D2-4: Billing 路由集成测试

**Files:**

- Create: `apps/api/src/__tests__/billing.test.ts`

**测试用例 (~6)：**

1. GET /billing/status — 无订阅返回 FREE plan
2. GET /billing/status — 有订阅返回 PRO plan
3. POST /billing/checkout — 成功返回 checkout URL
4. POST /billing/checkout — 无效 plan 返回 400
5. 配额检查 — FREE 用户超 50 笔拒绝
6. 配额检查 — PRO 用户无限制

---

### Task D3-1: 用户账单设置页面

**Files:**

- Create: `apps/web/src/app/[locale]/settings/billing/page.tsx` (或在 settings 页面内添加 billing section)
- Modify: `apps/web/messages/en.json` — 添加 `"billing"` i18n block
- Modify: `apps/web/messages/zh.json` — 添加 `"billing"` i18n block

**功能：**

- 当前方案显示（FREE / PRO / CPA）
- PRO/CPA 用户：管理订阅按钮 → Stripe Customer Portal
- FREE 用户：升级 CTA → 跳转 /pricing 或直接 Checkout
- 订阅状态：active / canceled / past_due 不同显示
- 当前税年 / 到期时间

**i18n keys (~20):** currentPlan, freePlan, proPlan, cpaPlan, manageSub, upgrade, billingStatus, active, canceled, pastDue, expiresAt, taxYear 等

---

### Task D3-2: 升级拦截引导

**Files:**

- Create: `apps/web/src/components/upgrade-modal.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/page.tsx` — 导入失败时显示升级弹窗
- Modify: `apps/web/messages/en.json` — 添加 `"upgrade"` i18n block
- Modify: `apps/web/messages/zh.json`

**功能：**

- 当 API 返回 `QUOTA_EXCEEDED` 错误时，显示升级弹窗
- 弹窗内容：当前已有 N 笔交易 / 免费限制 50 笔 / 升级 Pro 解锁无限
- CTA: "Upgrade to Pro — $49/tax year" → 调用 /billing/checkout
- 或 "View Plans" → 跳转 /pricing

---

### Task D3-3: Admin 订阅管理面板

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/page.tsx` — 添加订阅统计
- Modify: `apps/api/src/routes/admin.ts` — 扩展 stats 端点返回订阅统计

**功能：**

- Admin Dashboard 新增：活跃 Pro 用户数 / 活跃 CPA 用户数 / MRR 估算
- 用户列表新增 plan 列

---

## 工作流

```
D1-3 → D1-1 → D1-2（Admin UI 依赖角色传递）
D2-1 → D2-2 → D2-3 → D2-4（Stripe 后端顺序依赖）
D3-1 + D3-2 + D3-3（支付前端可并行，依赖 D2 完成）
```

**推荐执行顺序：**

1. D1-3（Auth Context 角色）→ D1-1（Admin Dashboard）→ D1-2（User Management）
2. D2-1（Prisma Schema）→ D2-2（Stripe 路由）→ D2-3（配额中间件）→ D2-4（测试）
3. D3-1（Billing UI）+ D3-2（升级弹窗）+ D3-3（Admin 订阅面板）并行

**每个 Task 完成后执行五步法审计。**
