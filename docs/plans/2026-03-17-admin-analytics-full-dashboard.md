# Admin Analytics Full Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade SaaS analytics dashboard with 15 modules covering revenue, users, retention, AI usage, and product insights — powered entirely by PostgreSQL + Prisma (zero external dependencies).

**Architecture:** 8 new backend API endpoints + 4 enhanced existing endpoints return time-series, cohort, and aggregate data. Frontend uses Recharts for all visualizations. Admin routes extracted to `admin-analytics.ts` (new file) to keep admin.ts under 350 lines. Analytics page split into tab-based sections with a global time range filter.

**Tech Stack:** Recharts (charts), Prisma raw SQL (cohort/time-series queries), PostgreSQL date_trunc/window functions, zod-openapi schemas, Vitest tests.

---

## Database Context (no schema changes needed)

All analytics queries use existing tables:

- `User` — createdAt, role, status, utmSource/Medium/Campaign, preferences (locale)
- `Subscription` — plan, status, createdAt, updatedAt, currentPeriodEnd
- `AuditLog` — userId, action (15 enum values), createdAt, details (JSON)
- `DataSource` — name (exchange format), createdAt
- `Transaction` — userId, createdAt

AuditAction enum: CREATE, UPDATE, DELETE, BULK_DELETE, IMPORT, EXPORT, CALCULATE, GENERATE_REPORT, AI_CLASSIFY, AI_CONFIRM, AI_CORRECT, LOGIN, LOGOUT, SETTINGS_CHANGE, SUBSCRIPTION_CHANGE

---

### Task 0: PostHog Integration Completion

**Goal:** Fill PostHog tracking gaps so the analytics dashboard has rich user-level data for cohort analysis, funnel attribution, and feature usage insights.

**Files:**

- Modify: `apps/web/src/lib/analytics.ts` — no changes needed (already supports traits)
- Modify: `apps/web/src/lib/auth-context.tsx` — enhance identifyUser calls with user traits
- Modify: `apps/web/src/app/auth/callback/page.tsx` — add OAuth login tracking + identifyUser
- Modify: `apps/web/src/app/[locale]/settings/page.tsx` — add settings change events
- Modify: `apps/web/src/app/[locale]/transactions/components/ImportPanel.tsx` — already has csv_import, verify
- Modify: `apps/web/src/app/[locale]/admin/system/page.tsx` — add admin config events

**Current coverage (13 events):**

- `$pageview` (nav.tsx), `login` (auth-context ×2), `signup` (auth-context)
- `onboarding_step` (×2), `tax_calculate`, `report_download` (×3), `upgrade_prompt`, `upgrade_click`, `csv_import`

**Missing events to add (~10 new):**

- `oauth_login` — OAuth callback (Google/GitHub)
- `email_verified` — after verification success
- `wallet_connect` — wallet added
- `wallet_sync` — wallet synced
- `exchange_connect` — exchange connected
- `ai_chat_message` — AI chat interaction
- `ai_classify` — AI auto-classification triggered
- `settings_change` — user settings saved
- `admin_config_change` — admin system config saved
- `first_calculation` — first tax calculation (milestone)

**Step 1: Enhance identifyUser calls with user traits**

In `apps/web/src/lib/auth-context.tsx`, change all 3 `identifyUser()` calls (lines 145, 160, 186) from:

```typescript
identifyUser(authData.data.user.id);
```

to:

```typescript
identifyUser(authData.data.user.id, {
  email: authData.data.user.email,
  name: authData.data.user.name,
  role: authData.data.user.role,
  plan: authData.data.user.subscription?.plan,
  emailVerified: authData.data.user.emailVerified,
  createdAt: authData.data.user.createdAt,
});
```

This applies to login (line 145), 2FA verify (line 160), and register (line 186) — each accesses user from different variables (`authData.data.user` vs `data.data.user`).

**Step 2: Add OAuth login tracking in callback page**

In `apps/web/src/app/auth/callback/page.tsx`, add imports and tracking:

```typescript
import { trackEvent, identifyUser } from "@/lib/analytics";
```

After `localStorage.setItem(TOKEN_KEY, res.data.token)` (line 35), add:

```typescript
trackEvent("oauth_login", { provider: state }); // state = "google" | "github"
if (res.data.user) {
  identifyUser(res.data.user.id, {
    email: res.data.user.email,
    role: res.data.user.role,
    plan: res.data.user.subscription?.plan,
  });
}
```

**Step 3: Add missing trackEvent calls across pages**

a) **Settings page** (`settings/page.tsx`): After successful preferences save, add:

```typescript
trackEvent("settings_change", { section: "preferences" });
```

After wallet connect success:

```typescript
trackEvent("wallet_connect", { chain: detectedChain });
```

After exchange connect success:

```typescript
trackEvent("exchange_connect", { exchange: exchangeName });
```

b) **Admin system page** (`admin/system/page.tsx`): After config save:

```typescript
trackEvent("admin_config_change", { key: configKey });
```

c) **AI chat** (if chat component exists): After sending message:

```typescript
trackEvent("ai_chat_message");
```

d) **Tax page** (`tax/page.tsx`): After first-ever calculation (check if user's first time):

```typescript
trackEvent("first_calculation", { method, year });
```

**Step 4: Verify — ensure no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/auth-context.tsx apps/web/src/app/auth/callback/page.tsx apps/web/src/app/[locale]/settings/page.tsx apps/web/src/app/[locale]/admin/system/page.tsx apps/web/src/app/[locale]/tax/page.tsx
git commit -m "feat(analytics): complete PostHog tracking — user traits, OAuth, 10 new events"
```

---

### Task 1: Install Recharts + Extract analytics routes to separate file

**Files:**

- Modify: `apps/web/package.json` — add recharts dependency
- Create: `apps/api/src/routes/admin-analytics.ts` — new file for all analytics endpoints
- Modify: `apps/api/src/routes/admin.ts` — remove analytics section, import from new file
- Modify: `apps/api/src/index.ts` (or route registration file) — register new route file

**Step 1: Install recharts**

```bash
pnpm --filter @dtax/web add recharts
```

**Step 2: Extract existing 4 analytics endpoints from admin.ts to admin-analytics.ts**

Move the existing `/admin/analytics/revenue`, `/admin/analytics/funnel`, `/admin/analytics/registrations`, `/admin/analytics/insights` handlers to the new file. Keep the same route paths and schemas. admin.ts should import and register the new route plugin.

Create `apps/api/src/routes/admin-analytics.ts`:

```typescript
import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../plugins/auth";
import { errorResponseSchema } from "../schemas/common";

export async function adminAnalyticsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // ... move existing 4 endpoints here, then add new ones in subsequent tasks
}
```

In `admin.ts`, replace the analytics section with:

```typescript
app.register(adminAnalyticsRoutes);
```

**Step 3: Verify existing tests still pass**

```bash
pnpm --filter @dtax/api test
```

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: extract analytics routes to admin-analytics.ts + install recharts"
```

---

### Task 2: Backend — MRR Trend + Registration Trend + ARPU APIs

**Files:**

- Modify: `apps/api/src/routes/admin-analytics.ts` — add 2 new endpoints + enhance revenue
- Test: `apps/api/src/__tests__/admin-analytics.test.ts` — new test file

**Step 1: Write tests for MRR trend and registration trend**

Test `GET /admin/analytics/mrr-trend?months=6` returns array of `{ month: "2026-01", mrr: number }`.
Test `GET /admin/analytics/registrations-trend?days=30` returns array of `{ date: "2026-03-17", count: number }`.
Test enhanced revenue endpoint returns `arpu` field.

**Step 2: Implement endpoints**

`GET /admin/analytics/mrr-trend`:

- Query `Subscription` grouped by `date_trunc('month', created_at)` for subscriptions that were active in each month
- For simplicity: iterate last N months, count active PRO/CPA subscriptions as of each month-end
- Return: `[{ month: "2026-01", mrr: 45.58, arr: 546.96 }]`

`GET /admin/analytics/registrations-trend`:

- Query: `prisma.user.groupBy({ by: [raw date_trunc('day', created_at)] })`
- Use Prisma `$queryRaw` for date_trunc:

```typescript
const rows = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
  SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
  FROM "users"
  WHERE created_at >= ${since}
  GROUP BY date
  ORDER BY date
`;
```

- Return: `[{ date: "2026-03-15", count: 3 }]`

Enhance revenue to include ARPU:

```typescript
const arpu = totalPaying > 0 ? mrr / totalPaying : 0;
```

**Step 3: Run tests**

```bash
pnpm --filter @dtax/api test -- admin-analytics
```

**Step 4: Commit**

```bash
git commit -m "feat(analytics): add MRR trend, registration trend, ARPU endpoints"
```

---

### Task 3: Backend — Active Users (DAU/WAU/MAU) + Locale Distribution APIs

**Files:**

- Modify: `apps/api/src/routes/admin-analytics.ts`
- Modify: `apps/api/src/__tests__/admin-analytics.test.ts`

**Step 1: Write tests**

Test `GET /admin/analytics/active-users` returns `{ dau: number, wau: number, mau: number, trend: [{ date, dau, wau }] }`.
Test `GET /admin/analytics/locale-distribution` returns `[{ locale: "zh", count: 5 }]`.

**Step 2: Implement**

`GET /admin/analytics/active-users`:

```typescript
// DAU: distinct users in audit_logs in last 24h
// WAU: distinct users in last 7 days
// MAU: distinct users in last 30 days
const [dau, wau, mau] = await Promise.all([
  prisma.$queryRaw<[{ count: number }]>`
    SELECT COUNT(DISTINCT user_id)::int AS count FROM audit_logs
    WHERE created_at >= NOW() - INTERVAL '1 day'`,
  prisma.$queryRaw<[{ count: number }]>`
    SELECT COUNT(DISTINCT user_id)::int AS count FROM audit_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'`,
  prisma.$queryRaw<[{ count: number }]>`
    SELECT COUNT(DISTINCT user_id)::int AS count FROM audit_logs
    WHERE created_at >= NOW() - INTERVAL '30 days'`,
]);

// Trend: daily DAU for last 30 days
const trend = await prisma.$queryRaw`
  SELECT date_trunc('day', created_at)::date AS date,
         COUNT(DISTINCT user_id)::int AS dau
  FROM audit_logs
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY date ORDER BY date
`;
```

`GET /admin/analytics/locale-distribution`:

```typescript
// Extract locale from preferences JSON, fall back to 'en'
const rows = await prisma.$queryRaw<Array<{ locale: string; count: number }>>`
  SELECT COALESCE(preferences->>'locale', 'en') AS locale,
         COUNT(*)::int AS count
  FROM users
  GROUP BY locale
  ORDER BY count DESC
`;
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(analytics): add active users DAU/WAU/MAU + locale distribution"
```

---

### Task 4: Backend — Cohort Retention Matrix API

**Files:**

- Modify: `apps/api/src/routes/admin-analytics.ts`
- Modify: `apps/api/src/__tests__/admin-analytics.test.ts`

**Step 1: Write test**

Test `GET /admin/analytics/cohort-retention?months=6` returns:

```json
{
  "cohorts": [
    { "month": "2025-10", "size": 15, "retention": [100, 80, 65, 50, 45, 40] }
  ]
}
```

**Step 2: Implement**

This is the most complex query. Uses a CTE:

```sql
WITH cohorts AS (
  SELECT id, date_trunc('month', created_at) AS cohort_month
  FROM users
  WHERE created_at >= $since
),
activity AS (
  SELECT DISTINCT user_id, date_trunc('month', created_at) AS active_month
  FROM audit_logs
  WHERE created_at >= $since
)
SELECT
  c.cohort_month,
  COUNT(DISTINCT c.id)::int AS cohort_size,
  EXTRACT(MONTH FROM AGE(a.active_month, c.cohort_month))::int AS month_offset,
  COUNT(DISTINCT a.user_id)::int AS active_count
FROM cohorts c
LEFT JOIN activity a ON c.id = a.user_id AND a.active_month >= c.cohort_month
GROUP BY c.cohort_month, month_offset
ORDER BY c.cohort_month, month_offset
```

Post-process in JS: group by cohort_month, compute retention percentage per offset.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(analytics): add cohort retention matrix endpoint"
```

---

### Task 5: Backend — Churn Rate + AI Usage + LTV APIs

**Files:**

- Modify: `apps/api/src/routes/admin-analytics.ts`
- Modify: `apps/api/src/__tests__/admin-analytics.test.ts`

**Step 1: Write tests**

Test `GET /admin/analytics/churn` returns `{ currentRate: 5.2, trend: [{ month, rate }] }`.
Test `GET /admin/analytics/ai-usage` returns `{ totalClassifications, totalChats, dailyTrend: [...] }`.
Test enhanced revenue returns `ltv` and `estimatedCac` fields.

**Step 2: Implement**

`GET /admin/analytics/churn`:

- Monthly churn = users whose subscription changed from PRO/CPA → FREE (via SUBSCRIPTION_CHANGE audit logs) or whose `currentPeriodEnd` passed without renewal.
- Simplified: count users with active subscription at month start vs month end.

```sql
-- For each month: (start_count - end_count + new_count) / start_count
WITH monthly AS (
  SELECT date_trunc('month', updated_at) AS month,
         COUNT(CASE WHEN status = 'canceled' THEN 1 END)::int AS churned,
         COUNT(*)::int AS total
  FROM subscriptions
  WHERE plan IN ('PRO', 'CPA')
  GROUP BY month
)
SELECT month, CASE WHEN total > 0 THEN (churned::float / total * 100) ELSE 0 END AS rate
FROM monthly ORDER BY month
```

`GET /admin/analytics/ai-usage`:

```typescript
const [classifications, chats, trend] = await Promise.all([
  prisma.auditLog.count({ where: { action: "AI_CLASSIFY" } }),
  prisma.auditLog.count({
    where: { action: { in: ["AI_CONFIRM", "AI_CORRECT"] } },
  }),
  prisma.$queryRaw`
    SELECT date_trunc('day', created_at)::date AS date,
           COUNT(CASE WHEN action = 'AI_CLASSIFY' THEN 1 END)::int AS classifications,
           COUNT(CASE WHEN action IN ('AI_CONFIRM', 'AI_CORRECT') THEN 1 END)::int AS chats
    FROM audit_logs
    WHERE action IN ('AI_CLASSIFY', 'AI_CONFIRM', 'AI_CORRECT')
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY date ORDER BY date
  `,
]);
```

LTV: add to revenue endpoint:

```typescript
// Simple LTV = ARPU * avg lifetime months
// Avg lifetime = 1 / monthly churn rate (if churn > 0)
const ltv = churnRate > 0 ? arpu / (churnRate / 100) : arpu * 24; // cap at 24 months
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(analytics): add churn rate, AI usage, LTV endpoints"
```

---

### Task 6: Backend — Enhanced Funnel + Time-Range Filter

**Files:**

- Modify: `apps/api/src/routes/admin-analytics.ts`
- Modify: `apps/api/src/__tests__/admin-analytics.test.ts`

**Step 1: Write tests**

Test funnel adds "calculated" step between imported and paid.
Test all analytics endpoints accept `?days=` or `?months=` query parameter.

**Step 2: Implement**

Enhanced funnel — add "calculated" step:

```typescript
const calculated = await prisma.user.count({
  where: { taxReports: { some: {} } },
});
// Return: { registered, verified, imported, calculated, paid }
```

Add `days` query param to: revenue, active-users, insights, ai-usage.
Default: 30 days. Max: 365. Apply `WHERE created_at >= $since` to relevant queries.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(analytics): add calculated funnel step + time-range filter"
```

---

### Task 7: Frontend — Recharts Setup + Time Range Filter + KPI Cards

**Files:**

- Modify: `apps/web/src/lib/api.ts` — add new API functions + update types
- Modify: `apps/web/src/app/[locale]/admin/analytics/page.tsx` — restructure page

**Step 1: Add TypeScript interfaces and API functions**

In `api.ts`, add:

```typescript
export interface MrrTrendPoint { month: string; mrr: number; arr: number }
export interface RegistrationTrendPoint { date: string; count: number }
export interface ActiveUsers { dau: number; wau: number; mau: number; trend: Array<{ date: string; dau: number }> }
export interface CohortRow { month: string; size: number; retention: number[] }
export interface ChurnData { currentRate: number; trend: Array<{ month: string; rate: number }> }
export interface AiUsage { totalClassifications: number; totalChats: number; dailyTrend: Array<{ date: string; classifications: number; chats: number }> }
export interface LocaleDistItem { locale: string; count: number }

// Update RevenueAnalytics to add arpu, ltv
export interface RevenueAnalytics { mrr: number; arr: number; arpu: number; ltv: number; planDistribution: Record<string, number>; totalPaying: number }
// Update FunnelData to add calculated
export interface FunnelData { registered: number; verified: number; imported: number; calculated: number; paid: number }

export async function getMrrTrend(months?: number) { ... }
export async function getRegistrationsTrend(days?: number) { ... }
export async function getActiveUsers() { ... }
export async function getCohortRetention(months?: number) { ... }
export async function getChurnData() { ... }
export async function getAiUsage(days?: number) { ... }
export async function getLocaleDistribution() { ... }
```

**Step 2: Restructure analytics page with time range filter**

Add time range tabs at top: 7d / 30d / 90d / 12m / All.
Store in `useState<number>(30)` days state.
Re-fetch data when range changes.

Update KPI cards row to 6 columns: MRR, ARR, ARPU, Paying Users, Conversion Rate, Churn Rate.

**Step 3: tsc --noEmit to verify types**

**Step 4: Commit**

```bash
git commit -m "feat(analytics): add API types/functions + time range filter + KPI cards"
```

---

### Task 8: Frontend — MRR Trend + Registration Trend Charts

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/analytics/page.tsx`

**Step 1: Implement MRR Trend AreaChart**

```tsx
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

<div className="card p-6 mb-6">
  <h2 className="text-xl text-primary mb-4">{t("mrrTrend")}</h2>
  <ResponsiveContainer width="100%" height={300}>
    <AreaChart data={mrrTrend}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} />
      <YAxis
        stroke="var(--text-muted)"
        fontSize={12}
        tickFormatter={(v) => `$${v}`}
      />
      <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "MRR"]} />
      <Area
        type="monotone"
        dataKey="mrr"
        stroke="#6366f1"
        fill="#6366f1"
        fillOpacity={0.15}
      />
    </AreaChart>
  </ResponsiveContainer>
</div>;
```

**Step 2: Implement Registration Trend BarChart**

Similar pattern with `BarChart` + `Bar` component. dataKey="count", color="#10b981".

**Step 3: Verify in browser, commit**

```bash
git commit -m "feat(analytics): add MRR trend area chart + registration trend bar chart"
```

---

### Task 9: Frontend — User Funnel + Active Users + Subscription Donut

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/analytics/page.tsx`

**Step 1: Implement Funnel visualization**

Use horizontal `BarChart` with decreasing widths, each bar a different color:

```tsx
const funnelData = [
  { name: t("funnelRegistered"), value: funnel.registered, fill: "#6366f1" },
  { name: t("funnelVerified"), value: funnel.verified, fill: "#8b5cf6" },
  { name: t("funnelImported"), value: funnel.imported, fill: "#a78bfa" },
  { name: t("funnelCalculated"), value: funnel.calculated, fill: "#c4b5fd" },
  { name: t("funnelPaid"), value: funnel.paid, fill: "#10b981" },
];
// BarChart layout="vertical" with funnel data
```

**Step 2: Implement Active Users LineChart**

3 lines: DAU (green), WAU (blue), MAU (purple) on same chart from `activeUsers.trend`.

**Step 3: Implement Subscription DonutChart**

```tsx
import { PieChart, Pie, Cell } from "recharts";
// FREE=#6366f1, PRO=#8b5cf6, CPA=#10b981
```

**Step 4: Commit**

```bash
git commit -m "feat(analytics): add funnel, active users, subscription donut charts"
```

---

### Task 10: Frontend — Cohort Retention Heatmap Table

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/analytics/page.tsx`

**Step 1: Implement cohort retention as a styled HTML table**

Recharts doesn't have a native heatmap, so use a CSS table with color-coded cells:

```tsx
function RetentionHeatmap({ cohorts }: { cohorts: CohortRow[] }) {
  const getColor = (pct: number) => {
    // Green gradient: 100% = deep green, 0% = red
    if (pct >= 80) return "#10b981";
    if (pct >= 60) return "#34d399";
    if (pct >= 40) return "#fbbf24";
    if (pct >= 20) return "#f97316";
    return "#ef4444";
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2">{t("cohortMonth")}</th>
            <th className="text-center p-2">{t("cohortSize")}</th>
            {/* Month 0, 1, 2, ... headers */}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.month}>
              <td className="p-2 text-muted">{c.month}</td>
              <td className="p-2 text-center">{c.size}</td>
              {c.retention.map((pct, i) => (
                <td
                  key={i}
                  className="p-2 text-center text-white rounded-sm"
                  style={{ background: getColor(pct), minWidth: "48px" }}
                >
                  {pct.toFixed(0)}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git commit -m "feat(analytics): add cohort retention heatmap table"
```

---

### Task 11: Frontend — Churn + AI Usage + Source/Locale/Exchange/Feature Charts

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/analytics/page.tsx`

**Step 1: Implement Churn Rate LineChart**

Single line chart from `churnData.trend`, dataKey="rate", color="#ef4444".

**Step 2: Implement AI Usage stacked BarChart**

Stacked bar chart with two series: classifications (indigo) + chats (purple) per day.

**Step 3: Implement Locale Distribution DonutChart**

PieChart with locale distribution data.

**Step 4: Refactor existing charts**

Replace CSS bar charts (registration sources, top exchanges, feature usage) with Recharts `BarChart` layout="vertical" for consistency.

**Step 5: Commit**

```bash
git commit -m "feat(analytics): add churn, AI usage, locale, refactor existing charts to Recharts"
```

---

### Task 12: Frontend — Page Layout, Tabs, Responsive Grid

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/analytics/page.tsx`

**Step 1: Organize into logical sections**

Group the 15 modules into a scrollable single page with clear section headers:

```
[Time Range Filter: 7d | 30d | 90d | 12m | All]

── Overview ──
[KPI Cards: MRR | ARR | ARPU | Paying | Conversion | Churn]

── Revenue ──
[MRR Trend AreaChart] [Subscription DonutChart]

── Users ──
[Registration Trend BarChart] [User Funnel]
[Active Users LineChart] [Locale Distribution DonutChart]

── Retention ──
[Cohort Retention Heatmap]
[Churn Rate LineChart]

── AI ──
[AI Usage BarChart] [LTV / CAC StatCards]

── Product ──
[Source Attribution BarChart] [Top Exchanges BarChart]
[Feature Usage BarChart]
```

**Step 2: Make grid responsive**

- Desktop: 2-column grid (grid-template-columns: 1fr 1fr)
- Tablet/mobile: stack to 1 column at 768px
- KPI cards: 6 columns → 3x2 on tablet → 2x3 on mobile

**Step 3: Ensure page file is under 350 lines**

If page.tsx exceeds 350 lines, extract chart sections into separate components:

- `apps/web/src/app/[locale]/admin/analytics/revenue-charts.tsx`
- `apps/web/src/app/[locale]/admin/analytics/user-charts.tsx`
- `apps/web/src/app/[locale]/admin/analytics/retention-charts.tsx`
- `apps/web/src/app/[locale]/admin/analytics/product-charts.tsx`

**Step 4: Commit**

```bash
git commit -m "feat(analytics): organize layout, responsive grid, extract chart components"
```

---

### Task 13: i18n — Add Translation Keys (7 locales)

**Files:**

- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` — admin namespace

**Step 1: Add ~30 new i18n keys per locale**

Keys needed:

```
mrrTrend, registrationTrend, activeUsers, dauLabel, wauLabel, mauLabel,
cohortRetention, cohortMonth, cohortSize, monthN (Month 0-11),
churnRate, churnTrend, aiUsage, aiClassifications, aiChats, aiCostEstimate,
localeDistribution, ltvLabel, cacLabel, ltvCacRatio,
funnelRegistered, funnelVerified, funnelImported, funnelCalculated, funnelPaid,
subscriptionDistributionChart, arpu,
timeRange7d, timeRange30d, timeRange90d, timeRange12m, timeRangeAll,
noDataYet
```

**Step 2: Validate JSON**

```bash
node -e "['en','zh','zh-Hant','es','ja','ko','pt'].forEach(l=>{JSON.parse(require('fs').readFileSync('apps/web/messages/'+l+'.json','utf8'));console.log(l+': OK')})"
```

**Step 3: Commit**

```bash
git commit -m "feat(analytics): add i18n keys for full dashboard (7 locales)"
```

---

### Task 14: Tests + Five-Step Audit

**Files:**

- Modify: `apps/api/src/__tests__/admin-analytics.test.ts` — ensure all endpoints covered

**Step 1: Ensure test coverage**

Tests for all 12 analytics endpoints (4 existing + 8 new):

1. `GET /admin/analytics/revenue` — returns mrr, arr, arpu, ltv, planDistribution
2. `GET /admin/analytics/funnel` — returns 5 steps including calculated
3. `GET /admin/analytics/registrations` — returns users + sourceDistribution
4. `GET /admin/analytics/insights` — returns topExchanges + featureUsage
5. `GET /admin/analytics/mrr-trend` — returns monthly array
6. `GET /admin/analytics/registrations-trend` — returns daily array
7. `GET /admin/analytics/active-users` — returns dau, wau, mau, trend
8. `GET /admin/analytics/cohort-retention` — returns cohorts array
9. `GET /admin/analytics/churn` — returns currentRate + trend
10. `GET /admin/analytics/ai-usage` — returns totals + dailyTrend
11. `GET /admin/analytics/locale-distribution` — returns locale array
12. Auth guard: all endpoints return 403 for non-ADMIN users

**Step 2: Run five-step audit**

```bash
# 1. TypeScript
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json

# 2. Tests
pnpm --filter @dtax/api test

# 3. JSON validation
node -e "['en','zh','zh-Hant','es','ja','ko','pt'].forEach(l=>{JSON.parse(require('fs').readFileSync('apps/web/messages/'+l+'.json','utf8'));console.log(l+': OK')})"

# 4. Build check
pnpm --filter @dtax/web build

# 5. Verify all pass, commit final
```

**Step 3: Final commit + push**

```bash
git commit -m "test(analytics): full test coverage + five-step audit pass"
git push origin-private main
```

---

## Summary

| Task | Description                       | New API Endpoints  | Charts      |
| ---- | --------------------------------- | ------------------ | ----------- |
| 0    | PostHog tracking completion       | 0                  | 0           |
| 1    | Extract routes + install Recharts | 0                  | 0           |
| 2    | MRR trend + Reg trend + ARPU      | 2 new + 1 enhanced | 0           |
| 3    | Active users + Locale dist        | 2 new              | 0           |
| 4    | Cohort retention matrix           | 1 new              | 0           |
| 5    | Churn + AI usage + LTV            | 2 new + 1 enhanced | 0           |
| 6    | Enhanced funnel + time filter     | 0 enhanced         | 0           |
| 7    | Frontend types + filter + KPIs    | 0                  | 6 StatCards |
| 8    | MRR + Reg trend charts            | 0                  | 2 charts    |
| 9    | Funnel + Active + Donut           | 0                  | 3 charts    |
| 10   | Cohort heatmap                    | 0                  | 1 heatmap   |
| 11   | Churn + AI + Locale + refactor    | 0                  | 6 charts    |
| 12   | Layout + responsive + extract     | 0                  | layout      |
| 13   | i18n (7 locales × ~30 keys)       | 0                  | 0           |
| 14   | Tests + audit                     | 0                  | 0           |

**Total: 15 tasks (Task 0-14), 8 new endpoints, 2 enhanced, ~18 chart/visualization components, ~210 i18n keys, ~10 new PostHog events**
