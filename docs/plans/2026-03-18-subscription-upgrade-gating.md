# 订阅管理增强 + 会员门控策略 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完善订阅管理（到期时间、自动续订）+ 会员门控策略（计算前检查、保存报告限制、对比报告锁定）

**Architecture:** Stripe checkout 从 mode="payment" 改为 mode="subscription" 实现自动续订；前端增加到期/续订状态展示；Tax/Compare 页面增加前端门控 + 升级弹窗

**Tech Stack:** Stripe API (subscription mode), Prisma, Fastify, React, next-intl i18n

---

## Part A: 订阅管理增强

### Task 1: Stripe Checkout 切换为 Subscription 模式

**Files:**

- Modify: `apps/api/src/routes/billing.ts:160-163` (checkout session creation)
- Modify: `apps/api/src/routes/billing.ts:250-271` (webhook checkout.session.completed handler)

**Step 1: 修改 checkout 创建**

将 `mode: "payment"` 改为 `mode: "subscription"`：

```typescript
const session = await s.checkout.sessions.create({
  customer: customerId,
  mode: "subscription", // 改: payment → subscription
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${process.env.WEB_URL || "http://localhost:3000"}/settings?billing=success`,
  cancel_url: `${process.env.WEB_URL || "http://localhost:3000"}/pricing`,
  metadata: {
    userId: user.id,
    plan: body.plan,
    taxYear: String(body.taxYear || new Date().getFullYear()),
  },
});
```

**Step 2: 更新 webhook 处理 checkout.session.completed**

subscription mode 下 `session.subscription` 会有值，需确保存入 `stripeSubId`：

```typescript
if (event.type === "checkout.session.completed") {
  const session = event.data.object as Stripe.Checkout.Session;
  const { userId, plan, taxYear } = session.metadata || {};
  if (userId && plan) {
    // 获取 subscription 详情以读取 current_period_end
    let periodEnd: Date | null = null;
    if (session.subscription) {
      const stripeSub = await s.subscriptions.retrieve(
        session.subscription as string,
      );
      periodEnd = new Date(stripeSub.items.data[0].current_period_end * 1000);
    }
    await prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: plan as "PRO" | "CPA",
        taxYear: taxYear ? parseInt(taxYear) : null,
        status: "active",
        stripeSubId: (session.subscription as string) || null,
        currentPeriodEnd: periodEnd,
      },
      create: {
        userId,
        plan: plan as "PRO" | "CPA",
        taxYear: taxYear ? parseInt(taxYear) : null,
        status: "active",
        stripeCustomerId: session.customer as string,
        stripeSubId: (session.subscription as string) || null,
        currentPeriodEnd: periodEnd,
      },
    });
  }
}
```

**Step 3: 增强 customer.subscription.updated webhook**

添加 `cancel_at_period_end` 同步：

```typescript
if (event.type === "customer.subscription.updated") {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = sub.customer as string;
  const periodEnd = sub.items?.data?.[0]?.current_period_end;
  await prisma.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      status: sub.status,
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}
```

**Step 4: 提交**

```bash
git add apps/api/src/routes/billing.ts
git commit -m "feat(billing): switch checkout to subscription mode, sync cancel_at_period_end"
```

### Task 2: Prisma Schema 添加 cancelAtPeriodEnd 字段

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (Subscription model)

**Step 1: 添加字段**

在 Subscription model 中添加：

```prisma
model Subscription {
  // ... existing fields ...
  cancelAtPeriodEnd Boolean   @default(false) @map("cancel_at_period_end")
  // ... existing timestamps ...
}
```

**Step 2: 生成迁移**

```bash
cd apps/api && npx prisma migrate dev --name add-cancel-at-period-end
```

**Step 3: 提交**

```bash
git add apps/api/prisma/
git commit -m "feat(schema): add cancelAtPeriodEnd to Subscription model"
```

### Task 3: 后端 BillingStatus 返回 cancelAtPeriodEnd

**Files:**

- Modify: `apps/api/src/routes/billing.ts:36-46` (billingStatusSchema)
- Modify: `apps/api/src/routes/billing.ts:65-88` (GET /billing/status handler)

**Step 1: 更新 schema 和 handler**

```typescript
const billingStatusSchema = z
  .object({
    plan: z.string(),
    status: z.string(),
    taxYear: z.number().int().nullable(),
    currentPeriodEnd: z.date().nullable(),
    hasStripeAccount: z.boolean(),
    cancelAtPeriodEnd: z.boolean().optional(), // 新增
    clientCount: z.number().int().optional(),
    clientLimit: z.number().int().optional(),
  })
  .openapi({ ref: "BillingStatus" });

// handler 中添加:
const baseData = {
  plan,
  status: sub?.status ?? "active",
  taxYear: sub?.taxYear ?? null,
  currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  hasStripeAccount: !!sub?.stripeCustomerId,
  cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false, // 新增
};
```

**Step 2: 提交**

```bash
git add apps/api/src/routes/billing.ts
git commit -m "feat(billing): return cancelAtPeriodEnd in billing status"
```

### Task 4: 前端 Settings 页面显示到期时间和续订状态

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx:1173-1213`
- Modify: `apps/web/messages/*.json` (7 locales)

**Step 1: 增强 Settings 账单区域**

在现有到期时间显示后，添加续订状态：

```tsx
{
  billing.currentPeriodEnd && (
    <div>
      <span className="text-muted">{t("expiresAt")}: </span>
      <span className="text-primary">
        {new Date(billing.currentPeriodEnd).toLocaleDateString()}
      </span>
    </div>
  );
}
{
  /* 续订状态 */
}
<div>
  <span className="text-muted">{t("autoRenew")}: </span>
  {billing.cancelAtPeriodEnd ? (
    <span className="text-loss">{t("autoRenewOff")}</span>
  ) : (
    <span className="text-gain">{t("autoRenewOn")}</span>
  )}
</div>;
```

**Step 2: 添加 i18n keys (7 locales)**

| key                   | en                               | zh                     |
| --------------------- | -------------------------------- | ---------------------- |
| settings.autoRenew    | Auto-Renewal                     | 自动续订               |
| settings.autoRenewOn  | Active (renews automatically)    | 已开启（到期自动续费） |
| settings.autoRenewOff | Canceled (expires at period end) | 已取消（到期后停止）   |

其他 5 locales 按语言翻译。

**Step 3: 提交**

```bash
git add apps/web/src/app/[locale]/settings/page.tsx apps/web/messages/*.json
git commit -m "feat(settings): show subscription expiry date and auto-renewal status"
```

### Task 5: 前端 Dashboard plan banner 显示到期时间

**Files:**

- Modify: `apps/web/src/app/[locale]/page.tsx` (plan banner area)

**Step 1: 增强 plan banner**

在 plan banner 中添加到期时间（仅 PRO/CPA 用户有 currentPeriodEnd 时显示）。需要 fetch billing status 返回完整数据（已在 getBillingStatus 中）。

修改 dashboard 的 billing fetch 存储完整 BillingStatus 而非仅 plan string：

```tsx
const [billing, setBilling] = useState<BillingStatus | null>(null);
// ...
getBillingStatus()
  .then((res) => {
    if (res?.data) setBilling(res.data);
  })
  .catch(() => {});
```

在 plan banner 中显示：

```tsx
{
  billing && billing.plan !== "FREE" && billing.currentPeriodEnd && (
    <span className="plan-banner-expiry">
      {t("planExpiry", {
        date: new Date(billing.currentPeriodEnd).toLocaleDateString(),
      })}
    </span>
  );
}
```

**Step 2: 添加 i18n keys (7 locales)**

| key                  | en              | zh           |
| -------------------- | --------------- | ------------ |
| dashboard.planExpiry | Expires: {date} | 到期：{date} |

**Step 3: 提交**

```bash
git add apps/web/src/app/[locale]/page.tsx apps/web/messages/*.json
git commit -m "feat(dashboard): show plan expiry date in plan banner"
```

### Task 6: 更新 billing 测试

**Files:**

- Modify: `apps/api/src/__tests__/billing.test.ts`

**Step 1: 添加测试用例**

```typescript
it("GET /billing/status returns cancelAtPeriodEnd", async () => {
  mockPrisma.subscription.findUnique.mockResolvedValueOnce({
    plan: "PRO",
    status: "active",
    taxYear: 2025,
    currentPeriodEnd: new Date("2027-03-18"),
    stripeCustomerId: "cus_test",
    cancelAtPeriodEnd: true,
  });
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/billing/status",
    headers: authHeader,
  });
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.data.cancelAtPeriodEnd).toBe(true);
  expect(body.data.currentPeriodEnd).toBeTruthy();
});
```

**Step 2: 提交**

```bash
git add apps/api/src/__tests__/billing.test.ts
git commit -m "test(billing): add cancelAtPeriodEnd and subscription status tests"
```

---

## Part B: 会员门控策略

### Task 7: Tax 页面计算前检查 — 前端交易数量 + 升级弹窗

**Files:**

- Modify: `apps/web/src/app/[locale]/tax/page.tsx`
- Modify: `apps/web/src/app/globals.css` (modal styles)
- Modify: `apps/web/messages/*.json` (7 locales)

**Step 1: 添加 billing + quota 状态**

```tsx
const [billing, setBilling] = useState<BillingStatus | null>(null);
const [showUpgradeModal, setShowUpgradeModal] = useState(false);

useEffect(() => {
  getBillingStatus()
    .then((res) => {
      if (res?.data) setBilling(res.data);
    })
    .catch(() => {});
}, []);
```

**Step 2: 计算前检查**

在 handleCalculate 中，如果 FREE 用户交易数 > 50，显示升级弹窗而非调用 API（后端也会拦截，但前端提前引导更好的 UX）：

```tsx
async function handleCalculate() {
  // FREE 用户交易超额前端拦截
  if (billing?.plan === "FREE" && totalTx > 50) {
    setShowUpgradeModal(true);
    return;
  }
  // 正常计算流程...
}
```

**Step 3: 升级弹窗组件**

```tsx
{
  showUpgradeModal && (
    <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <Sparkles size={32} className="text-accent mb-3" />
        <h3 className="text-lg font-semibold mb-2">{t("upgradeRequired")}</h3>
        <p className="text-sm text-muted mb-4">{t("upgradeRequiredDesc")}</p>
        <div className="flex gap-3">
          <button
            className="btn btn-secondary flex-1"
            onClick={() => setShowUpgradeModal(false)}
          >
            {tc("cancel")}
          </button>
          <Link href="/pricing" className="btn btn-primary flex-1">
            <Sparkles size={14} /> {t("viewPlans")}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Form 8949 模糊处理 — FREE 用户只显示汇总，详情模糊**

当 FREE 用户有超过 50 笔交易时，Form 8949 表格添加模糊遮罩 + 升级提示覆盖层：

```tsx
{billing?.plan === "FREE" && totalTx > 50 ? (
  <div className="relative">
    <div className="blur-sm pointer-events-none opacity-50">
      {/* 渲染前几行作为预览 */}
    </div>
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="glass-card p-6 text-center">
        <Lock size={24} className="mx-auto mb-2 text-accent" />
        <p className="font-semibold">{t("form8949Locked")}</p>
        <p className="text-sm text-muted mb-3">{t("form8949LockedDesc")}</p>
        <Link href="/pricing" className="btn btn-primary btn-sm">
          {t("viewPlans")}
        </Link>
      </div>
    </div>
  </div>
) : (
  // 正常 Form 8949 渲染
)}
```

**Step 5: 添加 i18n keys (7 locales)**

| key                     | en                                                                                                     | zh                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| tax.upgradeRequired     | Upgrade Required                                                                                       | 需要升级                                                              |
| tax.upgradeRequiredDesc | Your {count} transactions exceed the free plan limit of 50. Upgrade to Pro for unlimited calculations. | 您的 {count} 笔交易超出免费方案的 50 笔限额。升级专业版享受无限计算。 |
| tax.viewPlans           | View Plans                                                                                             | 查看方案                                                              |
| tax.form8949Locked      | Form 8949 Details Locked                                                                               | Form 8949 详情已锁定                                                  |
| tax.form8949LockedDesc  | Upgrade to Pro to view and export complete Form 8949 details                                           | 升级专业版查看和导出完整 Form 8949 详情                               |

其他 5 locales 按语言翻译。

**Step 6: Modal CSS**

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 50);
}
.modal-content {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  padding: 24px;
  max-width: 400px;
  width: 90%;
  text-align: center;
}
```

**Step 7: 提交**

```bash
git add apps/web/src/app/[locale]/tax/page.tsx apps/web/src/app/globals.css apps/web/messages/*.json
git commit -m "feat(tax): add upgrade modal for FREE users over quota + Form 8949 blur lock"
```

### Task 8: 保存报告功能 — 前端 + 后端限制

**Files:**

- Modify: `apps/web/src/app/[locale]/tax/page.tsx`
- Modify: `apps/api/src/routes/tax.ts` (添加 POST /tax/reports endpoint)
- Modify: `apps/api/src/plugins/plan-guard.ts` (添加 checkReportSaveQuota)
- Modify: `apps/web/src/lib/api.ts` (添加 saveReport 函数)
- Modify: `apps/web/messages/*.json` (7 locales)

**Step 1: 后端 — plan-guard 添加报告保存配额**

```typescript
// plan-guard.ts
const FREE_REPORT_LIMIT = 1;

export async function checkReportSaveQuota(
  userId: string,
): Promise<QuotaResult> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = sub?.plan ?? "FREE";
  if (plan !== "FREE") {
    return { allowed: true, current: 0, limit: Infinity, plan };
  }
  const count = await prisma.taxReport.count({ where: { userId } });
  return {
    allowed: count < FREE_REPORT_LIMIT,
    current: count,
    limit: FREE_REPORT_LIMIT,
    plan,
  };
}
```

**Step 2: 后端 — POST /tax/reports 保存报告快照**

在 tax.ts 中已有 GET /tax/reports (读取 report history)，需要添加 POST 端点保存报告：

```typescript
// POST /tax/reports — Save report snapshot
r.post(
  "/tax/reports",
  {
    schema: {
      tags: ["tax"],
      summary: "Save a tax report snapshot",
      body: z.object({
        year: z.number().int(),
        method: z.string(),
      }),
      response: {
        201: z.object({
          data: z.object({ id: z.string(), savedAt: z.date() }),
        }),
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
  },
  async (request, reply) => {
    const { year, method } = request.body as { year: number; method: string };

    // 检查 FREE 用户报告保存配额
    const quota = await checkReportSaveQuota(request.userId);
    if (!quota.allowed) {
      return reply.status(403).send({
        error: {
          code: "REPORT_SAVE_LIMIT",
          message: `Free plan allows ${quota.limit} saved report. Upgrade to Pro for unlimited.`,
          limit: quota.limit,
          current: quota.current,
        },
      });
    }

    // 查找已计算的报告
    const report = await prisma.taxReport.findFirst({
      where: { userId: request.userId, year, method },
      orderBy: { createdAt: "desc" },
    });
    if (!report) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "No report found. Calculate first.",
        },
      });
    }

    // 标记为已保存（或创建 saved snapshot）
    const updated = await prisma.taxReport.update({
      where: { id: report.id },
      data: { savedByUser: true },
    });

    return { data: { id: updated.id, savedAt: updated.updatedAt } };
  },
);
```

注意：需要检查 Prisma schema 中 TaxReport 是否有 `savedByUser` 字段。如果没有，需要添加迁移。

**Step 3: 前端 — api.ts 添加 saveReport**

```typescript
export async function saveReport(year: number, method: string) {
  return apiFetch<{ data: { id: string; savedAt: string } }>(
    "/api/v1/tax/reports",
    {
      method: "POST",
      body: JSON.stringify({ year, method }),
    },
  );
}
```

**Step 4: 前端 — Tax 页面添加「保存报告」按钮**

在计算完成后（taxSummary 有值时），显示保存按钮：

```tsx
{
  taxSummary && (
    <button
      className="btn btn-secondary btn-sm"
      onClick={handleSaveReport}
      disabled={saving}
    >
      <Save size={14} />
      {saving ? t("saving") : t("saveReport")}
    </button>
  );
}
```

FREE 用户保存后如果达到限额，显示升级提示。

**Step 5: 添加 i18n keys (7 locales)**

| key                 | en                                                      | zh                                        |
| ------------------- | ------------------------------------------------------- | ----------------------------------------- |
| tax.saveReport      | Save Report                                             | 保存报告                                  |
| tax.saving          | Saving...                                               | 保存中...                                 |
| tax.reportSaved     | Report saved successfully                               | 报告已保存                                |
| tax.reportSaveLimit | Free plan allows 1 saved report. Upgrade for unlimited. | 免费方案仅可保存 1 份报告，升级享无限保存 |

**Step 6: 提交**

```bash
git add apps/api/src/routes/tax.ts apps/api/src/plugins/plan-guard.ts apps/web/src/lib/api.ts apps/web/src/app/[locale]/tax/page.tsx apps/web/messages/*.json
git commit -m "feat(tax): add save report feature with FREE plan limit (1 saved report)"
```

### Task 9: Compare 页面 — FREE 用户限制对比 2 种方法

**Files:**

- Modify: `apps/web/src/app/[locale]/compare/page.tsx`
- Modify: `apps/web/messages/*.json` (7 locales)

**Step 1: 读取 compare 页面当前实现**

检查 compare 页面的方法选择逻辑，添加 FREE 用户最多选择 2 种方法的限制。

**Step 2: 前端门控**

```tsx
const [billing, setBilling] = useState<BillingStatus | null>(null);
const MAX_FREE_METHODS = 2;

// 方法选择时检查
function handleMethodToggle(method: string) {
  if (selectedMethods.includes(method)) {
    setSelectedMethods((prev) => prev.filter((m) => m !== method));
  } else {
    if (
      billing?.plan === "FREE" &&
      selectedMethods.length >= MAX_FREE_METHODS
    ) {
      setShowUpgradeHint(true);
      return;
    }
    setSelectedMethods((prev) => [...prev, method]);
  }
}
```

**Step 3: 升级提示**

```tsx
{
  showUpgradeHint && (
    <div className="text-sm text-accent mt-2 flex items-center gap-2">
      <Lock size={14} />
      {t("compareMethodLimit")}
      <Link href="/pricing" className="font-semibold underline">
        {t("upgrade")}
      </Link>
    </div>
  );
}
```

**Step 4: 添加 i18n keys (7 locales)**

| key                        | en                                                                    | zh                                        |
| -------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| compare.compareMethodLimit | Free plan supports comparing up to 2 methods. Upgrade to compare all. | 免费方案最多对比 2 种方法，升级享全部对比 |
| compare.upgrade            | Upgrade                                                               | 升级                                      |

**Step 5: 提交**

```bash
git add apps/web/src/app/[locale]/compare/page.tsx apps/web/messages/*.json
git commit -m "feat(compare): limit FREE users to 2 method comparison"
```

### Task 10: Prisma Schema — TaxReport 添加 savedByUser 字段

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (TaxReport model)

**Step 1: 检查 TaxReport model 是否有该字段，如果没有则添加**

```prisma
model TaxReport {
  // ... existing fields ...
  savedByUser Boolean @default(false) @map("saved_by_user")
}
```

**Step 2: 迁移**

```bash
cd apps/api && npx prisma migrate dev --name add-saved-by-user
```

**Step 3: 提交**

```bash
git add apps/api/prisma/
git commit -m "feat(schema): add savedByUser to TaxReport model"
```

### Task 11: 运行五步审计 + 最终提交

**Step 1: 五步法审计**

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/web exec tsc --noEmit
pnpm --filter @dtax/api test
node -e "['en','zh','zh-Hant','es','ja','ko','pt'].forEach(l=>{JSON.parse(require('fs').readFileSync('apps/web/messages/'+l+'.json','utf8'));console.log(l+': OK')})"
pnpm --filter @dtax/web build
```

**Step 2: 修复发现的问题**

**Step 3: 最终提交和推送**

```bash
git push origin-private main
```

---

## 依赖关系

```
Task 2 (Prisma schema cancelAtPeriodEnd) → Task 1 (billing.ts webhook)
Task 2 → Task 3 (billing status response)
Task 3 → Task 4 (Settings UI) + Task 5 (Dashboard UI)
Task 10 (Prisma schema savedByUser) → Task 8 (Save report)
Task 7 (计算前检查) — 独立
Task 9 (Compare 锁定) — 独立
```

**推荐执行顺序：**

1. Task 2 (Prisma cancelAtPeriodEnd) → Task 1 (billing mode) → Task 3 (status response) → Task 6 (tests)
2. Task 4 (Settings UI) + Task 5 (Dashboard UI) — 并行
3. Task 10 (Prisma savedByUser) → Task 8 (Save report)
4. Task 7 (Tax gate) — 独立
5. Task 9 (Compare gate) — 独立
6. Task 11 (审计)
