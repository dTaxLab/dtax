# Plan Tier Feature Enforcement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate premium features (PDF/TXF export, 1099-DA reconciliation, What-if simulator, Method comparison) behind PRO/CPA plan checks in the API, and show upgrade prompts in the frontend for FREE users.

**Architecture:** Add a generic `checkFeatureAccess()` to `plan-guard.ts` that checks subscription plan against a feature allowlist. Apply it in `tax.ts` route handlers. Frontend reads `billing.plan` and conditionally shows upgrade prompts or disables buttons.

**Tech Stack:** Fastify API (plan-guard plugin), Next.js frontend (billing status), Vitest tests

---

### Task 1: Add `checkFeatureAccess()` to plan-guard.ts

**Files:**

- Modify: `apps/api/src/plugins/plan-guard.ts`
- Test: `apps/api/src/__tests__/plan-guard.test.ts` (new)

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/plan-guard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    transaction: { count: vi.fn() },
    chatMessage: { count: vi.fn() },
  },
}));

import { checkFeatureAccess } from "../plugins/plan-guard.js";
import { prisma } from "../lib/prisma.js";

const mockSubscription = prisma.subscription as any;

describe("checkFeatureAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows PRO user to access pdf_export", async () => {
    mockSubscription.findUnique.mockResolvedValue({ plan: "PRO" });
    const result = await checkFeatureAccess("user1", "pdf_export");
    expect(result.allowed).toBe(true);
    expect(result.plan).toBe("PRO");
  });

  it("denies FREE user access to pdf_export", async () => {
    mockSubscription.findUnique.mockResolvedValue(null);
    const result = await checkFeatureAccess("user1", "pdf_export");
    expect(result.allowed).toBe(false);
    expect(result.plan).toBe("FREE");
    expect(result.requiredPlan).toBe("PRO");
  });

  it("allows CPA user to access reconciliation", async () => {
    mockSubscription.findUnique.mockResolvedValue({ plan: "CPA" });
    const result = await checkFeatureAccess("user1", "reconciliation");
    expect(result.allowed).toBe(true);
  });

  it("denies FREE user access to simulate", async () => {
    mockSubscription.findUnique.mockResolvedValue(null);
    const result = await checkFeatureAccess("user1", "simulate");
    expect(result.allowed).toBe(false);
    expect(result.requiredPlan).toBe("PRO");
  });

  it("allows FREE user to access csv_export", async () => {
    mockSubscription.findUnique.mockResolvedValue(null);
    const result = await checkFeatureAccess("user1", "csv_export");
    expect(result.allowed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/plan-guard.test.ts`
Expected: FAIL — `checkFeatureAccess` not exported

**Step 3: Write minimal implementation**

Add to `apps/api/src/plugins/plan-guard.ts`:

```typescript
/** Feature → minimum required plan */
const FEATURE_PLAN_MAP: Record<string, "PRO" | "CPA"> = {
  pdf_export: "PRO",
  txf_export: "PRO",
  reconciliation: "PRO",
  simulate: "PRO",
  compare_methods: "PRO",
  wash_sale: "PRO",
  schedule_d: "PRO",
  income_report: "PRO",
};

const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  CPA: 2,
};

export interface FeatureAccessResult {
  allowed: boolean;
  plan: string;
  requiredPlan?: string;
  feature: string;
}

export async function checkFeatureAccess(
  userId: string,
  feature: string,
): Promise<FeatureAccessResult> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = sub?.plan ?? "FREE";

  const requiredPlan = FEATURE_PLAN_MAP[feature];

  // Feature not in map = available to all plans
  if (!requiredPlan) {
    return { allowed: true, plan, feature };
  }

  const userRank = PLAN_RANK[plan] ?? 0;
  const requiredRank = PLAN_RANK[requiredPlan] ?? 0;

  if (userRank >= requiredRank) {
    return { allowed: true, plan, feature };
  }

  return { allowed: false, plan, requiredPlan, feature };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/plan-guard.test.ts`
Expected: 5/5 PASS

**Step 5: Commit**

```bash
git add apps/api/src/plugins/plan-guard.ts apps/api/src/__tests__/plan-guard.test.ts
git commit -m "feat(api): add checkFeatureAccess() for plan-tier feature gating"
```

---

### Task 2: Gate PDF/TXF export in Form 8949 route

**Files:**

- Modify: `apps/api/src/routes/tax.ts` (lines ~618-815)

**Step 1: Add import**

In `tax.ts`, add to the existing plan-guard import:

```typescript
import { checkFeatureAccess } from "../plugins/plan-guard.js";
```

**Step 2: Add plan check in form8949 handler**

Inside the `/tax/form8949` handler (after `const query = form8949QuerySchema.parse(request.query);`), add plan checks for pdf and txf formats:

```typescript
// Gate PDF/TXF formats behind PRO plan
if (query.format === "pdf" || query.format === "txf") {
  const access = await checkFeatureAccess(
    request.userId,
    query.format === "pdf" ? "pdf_export" : "txf_export",
  );
  if (!access.allowed) {
    return reply.status(403).send({
      error: {
        message: `${query.format.toUpperCase()} export requires a ${access.requiredPlan} plan`,
        code: "PLAN_UPGRADE_REQUIRED",
        requiredPlan: access.requiredPlan,
        feature: access.feature,
      },
    });
  }
}
```

**Step 3: Run existing tests**

Run: `cd apps/api && npx vitest run`
Expected: All existing tests pass (no route-level test for form8949 yet)

**Step 4: Commit**

```bash
git add apps/api/src/routes/tax.ts
git commit -m "feat(api): gate PDF/TXF export behind PRO plan"
```

---

### Task 3: Gate 1099-DA reconciliation, simulate, and compare-methods

**Files:**

- Modify: `apps/api/src/routes/tax.ts` (lines ~938-1209)

**Step 1: Add plan check to reconcile handler**

Inside `/tax/reconcile` handler, after `const body = reconcileBodySchema.parse(request.body);`:

```typescript
const access = await checkFeatureAccess(request.userId, "reconciliation");
if (!access.allowed) {
  return reply.status(403).send({
    error: {
      message: `1099-DA reconciliation requires a ${access.requiredPlan} plan`,
      code: "PLAN_UPGRADE_REQUIRED",
      requiredPlan: access.requiredPlan,
      feature: access.feature,
    },
  });
}
```

**Step 2: Add plan check to simulate handler**

Inside `/tax/simulate` handler, after `const body = simulateBodySchema.parse(request.body);`:

```typescript
const access = await checkFeatureAccess(request.userId, "simulate");
if (!access.allowed) {
  return reply.status(403).send({
    error: {
      message: `Tax impact simulator requires a ${access.requiredPlan} plan`,
      code: "PLAN_UPGRADE_REQUIRED",
      requiredPlan: access.requiredPlan,
      feature: access.feature,
    },
  });
}
```

**Step 3: Add plan check to compare-methods handler**

Inside `/tax/compare-methods` handler, after `const body = compareSchema.parse(request.body);`:

```typescript
const access = await checkFeatureAccess(request.userId, "compare_methods");
if (!access.allowed) {
  return reply.status(403).send({
    error: {
      message: `Method comparison requires a ${access.requiredPlan} plan`,
      code: "PLAN_UPGRADE_REQUIRED",
      requiredPlan: access.requiredPlan,
      feature: access.feature,
    },
  });
}
```

**Step 4: Run tests**

Run: `cd apps/api && npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add apps/api/src/routes/tax.ts
git commit -m "feat(api): gate reconciliation, simulator, and method comparison behind PRO plan"
```

---

### Task 4: Frontend upgrade prompts for FREE users

**Files:**

- Modify: `apps/web/src/app/[locale]/tax/page.tsx` (~lines 786-820)
- Modify: `apps/web/src/app/[locale]/reconcile/page.tsx`
- Modify: `apps/web/src/app/[locale]/simulator/page.tsx`

**Step 1: Add billing hook to tax page**

In `tax/page.tsx`, add billing status fetch and conditionally show PDF/TXF buttons only for PRO/CPA users, or show upgrade prompt:

```typescript
// Add to imports
import { getBillingStatus } from "@/lib/api";

// Add state + fetch in component body
const [plan, setPlan] = useState<string>("FREE");
useEffect(() => {
  getBillingStatus()
    .then((res) => setPlan(res.data.plan))
    .catch(() => setPlan("FREE"));
}, []);
```

Replace the PDF/TXF download buttons section (~line 791-811) with conditional rendering:

```typescript
{plan !== "FREE" ? (
  <>
    <a href={getForm8949PdfUrl(year, method, includeWashSales)} download className="btn btn-primary text-sm no-underline" onClick={() => trackEvent("report_download", { type: "pdf" })}>
      {t("form8949.downloadPdf")}
    </a>
    <a href={getForm8949TxfUrl(year, method, includeWashSales)} download className="btn btn-secondary text-sm no-underline" onClick={() => trackEvent("report_download", { type: "txf" })}>
      {t("form8949.downloadTxf")}
    </a>
  </>
) : (
  <Link href="/settings" className="btn btn-primary text-sm no-underline" onClick={() => trackEvent("upgrade_prompt", { feature: "pdf_export" })}>
    {t("form8949.upgradeToPdf")}
  </Link>
)}
```

**Step 2: Add upgrade prompt to reconcile page**

In `reconcile/page.tsx`, wrap the reconcile form in a plan check:

```typescript
const [plan, setPlan] = useState<string>("FREE");
useEffect(() => {
  getBillingStatus()
    .then((res) => setPlan(res.data.plan))
    .catch(() => setPlan("FREE"));
}, []);

// In JSX, show upgrade prompt if FREE
{plan === "FREE" && (
  <div className="card text-center py-8">
    <p className="text-secondary mb-4">{t("upgradeRequired")}</p>
    <Link href="/settings" className="btn btn-primary no-underline">
      {t("upgradeToPro")}
    </Link>
  </div>
)}
```

**Step 3: Add upgrade prompt to simulator page**

Same pattern in `simulator/page.tsx`.

**Step 4: Add i18n keys**

Add to all 7 locale files under `"form8949"`:

- `"upgradeToPdf"`: "Upgrade to PRO for PDF & TXF" (and translations)

Add to `"reconcile"`:

- `"upgradeRequired"`: "1099-DA reconciliation requires a PRO plan"
- `"upgradeToPro"`: "Upgrade to PRO"

Add to `"simulator"`:

- `"upgradeRequired"`: "Tax simulator requires a PRO plan"
- `"upgradeToPro"`: "Upgrade to PRO"

**Step 5: Run build**

Run: `cd apps/web && npx next build`
Expected: Build passes

**Step 6: Commit**

```bash
git add apps/web/src/app/[locale]/tax/page.tsx apps/web/src/app/[locale]/reconcile/page.tsx apps/web/src/app/[locale]/simulator/page.tsx apps/web/messages/
git commit -m "feat(web): add upgrade prompts for FREE users on premium features"
```

---

### Task 5: Gate cost basis methods (LIFO/HIFO/Specific ID) for FREE users

**Files:**

- Modify: `apps/api/src/routes/tax.ts` (calculate endpoint)

**Step 1: Add plan check in calculate handler**

The pricing page shows FREE = FIFO only, PRO/CPA = all methods. Add check after body parse in `/tax/calculate`:

```typescript
if (body.method !== "FIFO") {
  const access = await checkFeatureAccess(request.userId, "advanced_methods");
  if (!access.allowed) {
    return reply.status(403).send({
      error: {
        message: `${body.method} method requires a ${access.requiredPlan} plan. FREE plan supports FIFO only.`,
        code: "PLAN_UPGRADE_REQUIRED",
        requiredPlan: access.requiredPlan,
        feature: "advanced_methods",
      },
    });
  }
}
```

**Step 2: Add `advanced_methods` to FEATURE_PLAN_MAP**

In `plan-guard.ts`, add to the map:

```typescript
advanced_methods: "PRO",
```

**Step 3: Run tests**

Run: `cd apps/api && npx vitest run`
Expected: All pass

**Step 4: Commit**

```bash
git add apps/api/src/plugins/plan-guard.ts apps/api/src/routes/tax.ts
git commit -m "feat(api): gate LIFO/HIFO/Specific ID methods behind PRO plan"
```

---

### Task 6: Final verification

**Step 1: Run all API tests**

Run: `cd apps/api && npx vitest run`
Expected: All 275+ tests pass

**Step 2: Run tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Run web build**

Run: `cd apps/web && npx next build`
Expected: Build passes

**Step 4: Final commit (if any fixes needed)**

---

## Summary of Changes

| Endpoint                                      | Before        | After            |
| --------------------------------------------- | ------------- | ---------------- |
| `GET /tax/form8949?format=pdf`                | No plan check | PRO/CPA only     |
| `GET /tax/form8949?format=txf`                | No plan check | PRO/CPA only     |
| `GET /tax/form8949?format=csv`                | No plan check | All plans (free) |
| `GET /tax/form8949?format=json`               | No plan check | All plans (free) |
| `POST /tax/reconcile`                         | No plan check | PRO/CPA only     |
| `POST /tax/simulate`                          | No plan check | PRO/CPA only     |
| `POST /tax/compare-methods`                   | No plan check | PRO/CPA only     |
| `POST /tax/calculate` (LIFO/HIFO/SPECIFIC_ID) | No plan check | PRO/CPA only     |
| `POST /tax/calculate` (FIFO)                  | No plan check | All plans (free) |

## Open Source npm Package

`@dtax/tax-engine` continues to export ALL functions (including PDF, TXF, reconciliation, simulator, etc.) — this is by design for the Open Core model. The npm package is AGPL-3.0 and free to use. Plan gating only applies to the commercial SaaS API in `apps/api/`.
