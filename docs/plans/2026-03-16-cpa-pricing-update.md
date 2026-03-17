# CPA Pricing Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update CPA pricing from $199/seat to $499/year with 10 client licenses included ($39/extra client), and enforce client limits in the API.

**Architecture:** Three-layer change: (1) Frontend pricing display + i18n update across 7 locales, (2) API enforcement of 10-client CPA limit with clear error messages, (3) Billing test updates. Extra client purchasing deferred — show upgrade prompt when limit reached.

**Tech Stack:** Next.js, next-intl, Fastify, Prisma, Vitest, zod-openapi

---

## Priority Order

| #   | Task                                           | Impact | Area |
| --- | ---------------------------------------------- | ------ | ---- |
| 1   | Update pricing page display + i18n (7 locales) | High   | Web  |
| 2   | Enforce CPA 10-client limit in API             | High   | API  |
| 3   | Update billing + client tests                  | Medium | API  |

---

### Task 1: Update Pricing Page Display + i18n

**Files:**

- Modify: `apps/web/src/app/[locale]/pricing/page.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/zh-Hant.json`
- Modify: `apps/web/messages/es.json`
- Modify: `apps/web/messages/ja.json`
- Modify: `apps/web/messages/ko.json`
- Modify: `apps/web/messages/pt.json`

**Step 1: Update pricing page CPA price display**

In `apps/web/src/app/[locale]/pricing/page.tsx`, change the CPA card:

```tsx
// Line ~194: Change $199 to $499
<div className="text-accent mb-1 text-pricing font-extrabold">$499</div>
```

**Step 2: Update CPA feature list**

Replace the CPA features array to include client license info:

```tsx
{(["cpaF1", "cpaF2", "cpaF3", "cpaF4", "cpaF5", "cpaF6"] as const).map(...)
```

**Step 3: Update i18n keys in all 7 locales**

Under `"pricing"` namespace, update these keys:

**en.json:**

```json
"cpaDesc": "per year · 10 client licenses included",
"cpaF1": "Everything in Pro",
"cpaF2": "10 client licenses included",
"cpaF3": "Additional clients at $39 each",
"cpaF4": "Multi-client management",
"cpaF5": "White-label reports & bulk export",
"cpaF6": "Dedicated support + SLA"
```

**zh.json:**

```json
"cpaDesc": "每年 · 含 10 个客户许可证",
"cpaF1": "包含专业版所有功能",
"cpaF2": "含 10 个客户许可证",
"cpaF3": "额外客户每位 $39",
"cpaF4": "多客户管理",
"cpaF5": "白标报告和批量导出",
"cpaF6": "专属客服 + SLA"
```

**zh-Hant.json:**

```json
"cpaDesc": "每年 · 含 10 個客戶授權",
"cpaF1": "包含專業版所有功能",
"cpaF2": "含 10 個客戶授權",
"cpaF3": "額外客戶每位 $39",
"cpaF4": "多客戶管理",
"cpaF5": "白標報告和批量匯出",
"cpaF6": "專屬客服 + SLA"
```

**es.json:**

```json
"cpaDesc": "por año · 10 licencias de cliente incluidas",
"cpaF1": "Todo lo incluido en Pro",
"cpaF2": "10 licencias de cliente incluidas",
"cpaF3": "Clientes adicionales a $39 cada uno",
"cpaF4": "Gestión de múltiples clientes",
"cpaF5": "Informes de marca blanca y exportación masiva",
"cpaF6": "Soporte dedicado + SLA"
```

**ja.json:**

```json
"cpaDesc": "年額 · クライアントライセンス10件付き",
"cpaF1": "Proのすべての機能を含む",
"cpaF2": "クライアントライセンス10件付き",
"cpaF3": "追加クライアント1件につき$39",
"cpaF4": "マルチクライアント管理",
"cpaF5": "ホワイトラベルレポートと一括エクスポート",
"cpaF6": "専任サポート + SLA"
```

**ko.json:**

```json
"cpaDesc": "연간 · 클라이언트 라이선스 10개 포함",
"cpaF1": "Pro의 모든 기능 포함",
"cpaF2": "클라이언트 라이선스 10개 포함",
"cpaF3": "추가 클라이언트당 $39",
"cpaF4": "멀티 클라이언트 관리",
"cpaF5": "화이트 라벨 보고서 및 대량 내보내기",
"cpaF6": "전담 지원 + SLA"
```

**pt.json:**

```json
"cpaDesc": "por ano · 10 licenças de cliente incluídas",
"cpaF1": "Tudo incluído no Pro",
"cpaF2": "10 licenças de cliente incluídas",
"cpaF3": "Clientes adicionais por $39 cada",
"cpaF4": "Gerenciamento de múltiplos clientes",
"cpaF5": "Relatórios white-label e exportação em massa",
"cpaF6": "Suporte dedicado + SLA"
```

**Step 4: Update feature comparison table**

In the `FEATURE_COMPARISON` array, add a row for client licenses:

```typescript
{ key: "featureClientLicenses", free: false, pro: false, cpa: "featureCpa10Licenses" },
```

Add i18n keys in all 7 locales:

- `"featureClientLicenses": "Client Licenses"` (en)
- `"featureCpa10Licenses": "10 included (+$39/extra)"` (en)
- (translate for other 6 locales)

**Step 5: tsc + build + commit**

```bash
pnpm --filter @dtax/web exec tsc --noEmit
pnpm --filter @dtax/web build
git commit -m "feat(web): update CPA pricing to $499/year with 10 client licenses"
```

---

### Task 2: Enforce CPA 10-Client Limit in API

**Files:**

- Modify: `apps/api/src/routes/clients.ts`
- Modify: `apps/api/src/plugins/plan-guard.ts`

**Step 1: Add CPA client limit constant**

In `apps/api/src/plugins/plan-guard.ts`, add:

```typescript
export const CPA_CLIENT_LIMIT = 10;
```

**Step 2: Add client quota check function**

In `apps/api/src/plugins/plan-guard.ts`, add:

```typescript
export async function checkClientQuota(userId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  const count = await prisma.client.count({
    where: { cpaUserId: userId, status: { not: "REVOKED" } },
  });
  return {
    allowed: count < CPA_CLIENT_LIMIT,
    current: count,
    limit: CPA_CLIENT_LIMIT,
  };
}
```

**Step 3: Enforce limit in invite endpoint**

In `apps/api/src/routes/clients.ts`, in `POST /clients/invite`, before creating the client:

```typescript
const quota = await checkClientQuota(request.userId);
if (!quota.allowed) {
  return reply.status(403).send({
    error: {
      code: "CLIENT_LIMIT_REACHED",
      message: `CPA plan includes ${quota.limit} client licenses. Contact support for additional licenses.`,
    },
  });
}
```

**Step 4: Add client count to billing status**

In `apps/api/src/routes/billing.ts`, in `GET /billing/status`, add client count to the response for CPA users:

```typescript
// After getting subscription
if (sub?.plan === "CPA") {
  const clientCount = await prisma.client.count({
    where: { cpaUserId: request.userId, status: { not: "REVOKED" } },
  });
  return { data: { ...statusData, clientCount, clientLimit: 10 } };
}
```

**Step 5: tsc + tests + commit**

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/api test -- --run
git commit -m "feat(api): enforce CPA 10-client limit with quota check"
```

---

### Task 3: Update Tests

**Files:**

- Modify: `apps/api/src/__tests__/clients.test.ts`
- Modify: `apps/api/src/__tests__/billing.test.ts`

**Step 1: Add client limit test**

In `apps/api/src/__tests__/clients.test.ts`:

```typescript
it("should return 403 when CPA client limit reached", async () => {
  // Mock 10 existing clients
  mockPrisma.client.count.mockResolvedValueOnce(10);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/clients/invite",
    headers: { authorization: `Bearer ${cpaToken}` },
    payload: { email: "new@client.com" },
  });
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe("CLIENT_LIMIT_REACHED");
});

it("should allow invite when under client limit", async () => {
  mockPrisma.client.count.mockResolvedValueOnce(5);
  // ... rest of existing invite test logic
});
```

**Step 2: Update billing status test for CPA**

In `apps/api/src/__tests__/billing.test.ts`, add test for clientCount in CPA billing status.

**Step 3: tsc + tests + commit**

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/api test -- --run
git commit -m "test(api): add CPA client limit and billing status tests"
```

---

## Execution Notes

- Task 1 is frontend-only (pricing display + i18n)
- Task 2-3 are backend (API enforcement + tests)
- Each task ends with five-step audit: tsc → tests → build → commit
- Stripe price change ($199 → $499) requires updating STRIPE_CPA_PRICE_ID in Stripe Dashboard — this is a config change, not code
- Extra client purchasing ($39/client) is deferred — show upgrade message when limit hit
