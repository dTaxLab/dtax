# Audit Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all Critical and Important issues from the full project audit, plus the wallet connect 503 UX bug.

**Architecture:** Security fixes first (path traversal, token leak, auth whitelist), then correctness fixes (holding period, wrap-unwrap), then code quality (DRY extraction, error handling, file splitting). Each task is self-contained with its own five-step audit.

**Tech Stack:** TypeScript, Fastify, Prisma, Next.js 14, Vitest

---

## Priority Order

| Priority | Task                                       | Severity  | Module  |
| -------- | ------------------------------------------ | --------- | ------- |
| 1        | Report storage path traversal              | Critical  | API     |
| 2        | Auth whitelist: 2FA login + dedupe /docs   | Critical  | API     |
| 3        | JWT/Encryption production guards           | Critical  | API     |
| 4        | Auth token leak in URL → fetch+Blob        | Critical  | Web     |
| 5        | AuthGuard require() → router redirect      | Critical  | Web     |
| 6        | Settings silent error handling             | Critical  | Web     |
| 7        | Wallet connect 503 UX improvement          | Bug       | Web+API |
| 8        | Holding period: calendar-based calculation | Critical  | Engine  |
| 9        | Wrap-unwrap consumed lot check fix         | Critical  | Engine  |
| 10       | DRY: extract shared method helpers         | Important | Engine  |
| 11       | shared-types TxType alignment              | Important | Engine  |
| 12       | Risk scanner: add backward wash sale check | Important | Engine  |
| 13       | Notification polling visibility check      | Important | Web     |
| 14       | Hardcoded i18n strings cleanup             | Important | Web     |

---

### Task 1: Report Storage Path Traversal Fix

**Files:**

- Modify: `apps/api/src/lib/report-storage.ts`
- Modify: `apps/api/src/__tests__/report-storage.test.ts` (create if not exists)

**Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/report-storage.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";

// Mock fs before importing module
vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("test")),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("report-storage", () => {
  it("rejects filename with path traversal", async () => {
    const { saveReport } = await import("../lib/report-storage");
    await expect(
      saveReport("user1", "../../etc/passwd", Buffer.from("x"), "csv"),
    ).rejects.toThrow(/invalid/i);
  });

  it("rejects extension with path separators", async () => {
    const { saveReport } = await import("../lib/report-storage");
    await expect(
      saveReport("user1", "report", Buffer.from("x"), "../../../etc/shadow"),
    ).rejects.toThrow(/invalid/i);
  });

  it("rejects userId with path traversal", async () => {
    const { saveReport } = await import("../lib/report-storage");
    await expect(
      saveReport("../admin", "report", Buffer.from("x"), "csv"),
    ).rejects.toThrow(/invalid/i);
  });

  it("getReport rejects paths outside reports dir", async () => {
    const { getReport } = await import("../lib/report-storage");
    await expect(getReport("/etc/passwd")).rejects.toThrow(/invalid/i);
  });

  it("allows valid filenames", async () => {
    const { saveReport } = await import("../lib/report-storage");
    const result = await saveReport(
      "user-123",
      "form8949-2025",
      Buffer.from("data"),
      "csv",
    );
    expect(result.size).toBe(4);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dtax/api exec vitest run src/__tests__/report-storage.test.ts`
Expected: FAIL — no validation exists yet

**Step 3: Implement path sanitization**

```typescript
// apps/api/src/lib/report-storage.ts
import fs from "fs/promises";
import path from "path";

const REPORTS_DIR = path.resolve(process.env.REPORTS_DIR || "./data/reports");

function sanitize(segment: string): string {
  if (/[\/\\]|\.\./.test(segment)) {
    throw new Error(`Invalid path segment: ${segment}`);
  }
  return segment;
}

export async function saveReport(
  userId: string,
  filename: string,
  content: Buffer,
  extension: string,
): Promise<{ path: string; size: number }> {
  sanitize(userId);
  sanitize(filename);
  sanitize(extension);
  const dir = path.join(REPORTS_DIR, userId);
  const filepath = path.join(dir, `${filename}.${extension}`);
  // Double-check resolved path is within REPORTS_DIR
  if (!path.resolve(filepath).startsWith(REPORTS_DIR)) {
    throw new Error("Invalid file path");
  }
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filepath, content);
  return { path: filepath, size: content.length };
}

export async function getReport(filepath: string): Promise<Buffer> {
  if (!path.resolve(filepath).startsWith(REPORTS_DIR)) {
    throw new Error("Invalid file path");
  }
  return fs.readFile(filepath);
}

export async function deleteReportFile(filepath: string): Promise<void> {
  if (!path.resolve(filepath).startsWith(REPORTS_DIR)) {
    throw new Error("Invalid file path");
  }
  try {
    await fs.unlink(filepath);
  } catch {
    // File may already be deleted
  }
}

export function getReportsDir(): string {
  return REPORTS_DIR;
}
```

**Step 4: Run tests to verify pass**

Run: `pnpm --filter @dtax/api exec vitest run src/__tests__/report-storage.test.ts`
Expected: PASS

**Step 5: Five-step audit + commit**

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/api test
pnpm --filter @dtax/web build
git add apps/api/src/lib/report-storage.ts apps/api/src/__tests__/report-storage.test.ts
git commit -m "fix(api): sanitize report storage paths to prevent path traversal"
git push origin-private main
```

---

### Task 2: Auth Whitelist — Add 2FA Login + Remove Duplicate /docs

**Files:**

- Modify: `apps/api/src/plugins/auth.ts:44-54`

**Step 1: Write failing test**

```typescript
// Add to apps/api/src/__tests__/auth.test.ts — in existing test suite
describe("POST /auth/login/2fa", () => {
  it("returns 200 with valid temp token (not 401)", async () => {
    // This test verifies the route is accessible without Bearer token
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login/2fa",
      payload: { tempToken: "invalid-token", code: "000000" },
    });
    // Should NOT be 401 (auth middleware blocked) — should be 400 or other handler error
    expect(res.statusCode).not.toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — returns 401 because route not in whitelist

**Step 3: Fix auth whitelist**

In `apps/api/src/plugins/auth.ts`, replace lines 44-54:

```typescript
if (
  url.startsWith("/docs") ||
  url.startsWith("/api/health") ||
  url.startsWith("/api/v1/auth/register") ||
  url.startsWith("/api/v1/auth/login") ||
  url.startsWith("/api/v1/auth/verify-email") ||
  url.startsWith("/api/v1/auth/forgot-password") ||
  url.startsWith("/api/v1/auth/reset-password") ||
  url.startsWith("/api/v1/billing/webhook")
) {
  return;
}
```

Note: `/api/v1/auth/login` prefix already covers `/api/v1/auth/login/2fa`. The fix is just removing the duplicate `/docs` line.

**Step 4: Run tests**

Run: `pnpm --filter @dtax/api test`
Expected: PASS

**Step 5: Five-step audit + commit**

---

### Task 3: JWT/Encryption Production Guards

**Files:**

- Modify: `apps/api/src/index.ts:41-55`
- Modify: `apps/api/src/services/ccxt.ts:12-14`

**Step 1: Strengthen production env validation in index.ts**

Replace lines 41-55 in `index.ts`:

```typescript
if (process.env.NODE_ENV === "production") {
  const required = ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  // Reject known default secrets in production
  const knownDefaults = [
    "dev-secret-change-in-production",
    "dtax-dev-jwt-secret-change-in-production",
  ];
  if (knownDefaults.includes(process.env.JWT_SECRET!)) {
    console.error(
      "FATAL: JWT_SECRET must be changed from the default value in production",
    );
    process.exit(1);
  }
  if (process.env.JWT_SECRET!.length < 32) {
    console.error("FATAL: JWT_SECRET must be at least 32 characters");
    process.exit(1);
  }
  if (process.env.ENCRYPTION_KEY!.length < 32) {
    console.error("FATAL: ENCRYPTION_KEY must be at least 32 characters");
    process.exit(1);
  }
}
```

**Step 2: Remove fallback in ccxt.ts**

Replace lines 12-14 in `ccxt.ts`:

```typescript
const ENCRYPTION_KEY = Buffer.from(config.encryptionKey.padEnd(32, "0"));
```

The empty-string fallback to `databaseUrl` is removed. In dev without ENCRYPTION_KEY set, the key will be zeros — exchange API key features won't work but won't leak DB URL either.

**Step 3: Five-step audit + commit**

---

### Task 4: Auth Token Leak — Replace URL Token with Fetch+Blob

**Files:**

- Modify: `apps/web/src/lib/api.ts:1274-1278`
- Modify: `apps/web/src/app/[locale]/tax/page.tsx` (download link usage)

**Step 1: Replace getReportDownloadUrl with async download function**

In `api.ts`, replace `getReportDownloadUrl`:

```typescript
export async function downloadReport(reportId: string): Promise<void> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("dtax_token") : null;
  const res = await fetch(
    `${API_BASE}/api/v1/tax/reports/${reportId}/download`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition");
  const filename =
    disposition?.match(/filename="?(.+?)"?$/)?.[1] || `report-${reportId}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 2: Update tax/page.tsx to use downloadReport**

Replace the `<a href={getReportDownloadUrl(...)}>` with a button that calls `downloadReport()`.

**Step 3: Also fix getForm8949CsvUrl/PdfUrl/TxfUrl** — same pattern, replace URL-based with fetch+Blob.

**Step 4: Five-step audit + commit**

---

### Task 5: AuthGuard — Replace require() with Router Redirect

**Files:**

- Modify: `apps/web/src/app/[locale]/auth-guard.tsx`

**Step 1: Replace require() with redirect**

```typescript
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { EmptyState } from "@/components/ui";
import { useEffect } from "react";

const PUBLIC_PATHS = [
  "/auth",
  "/legal",
  "/pricing",
  "/features",
  "/security",
  "/exchanges",
  "/docs",
  "/for-cpas",
  "/faq",
  "/onboarding",
  "/blog",
  "/global-tax-rates",
];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const tc = useTranslations("common");

  const segments = pathname.split("/").filter(Boolean);
  const subPath = "/" + (segments[1] || "");
  const isPublic =
    segments.length <= 1 || PUBLIC_PATHS.some((p) => subPath.startsWith(p));

  useEffect(() => {
    if (!isPublic && !loading && !user) {
      router.replace(`/${locale}/auth`);
    }
  }, [isPublic, loading, user, router, locale]);

  if (isPublic) return <>{children}</>;
  if (loading) {
    return <EmptyState variant="loading" title={tc("loading")} card={false} />;
  }
  if (!user) {
    return <EmptyState variant="loading" title={tc("loading")} card={false} />;
  }
  return <>{children}</>;
}
```

**Step 2: Five-step audit + commit**

---

### Task 6: Settings Page Silent Error Handling

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx`

**Step 1: Replace all `catch { /* ignore */ }` with error state feedback**

For each catch block (12 total), set an error message using the existing `walletError` pattern or add section-specific error states. Minimum viable fix: use a shared `actionError` state and display via AlertBanner at the top of settings.

Add at the top of the component:

```typescript
const [actionError, setActionError] = useState("");
```

Replace each `catch { /* ignore */ }` with:

```typescript
catch (err: unknown) {
  setActionError(err instanceof Error ? err.message : "Operation failed");
}
```

Add AlertBanner display near the top of the JSX:

```tsx
{
  actionError && (
    <AlertBanner variant="error" onDismiss={() => setActionError("")}>
      {actionError}
    </AlertBanner>
  );
}
```

**Step 2: Five-step audit + commit**

---

### Task 7: Wallet Connect 503 UX Improvement

**Files:**

- Modify: `apps/api/src/routes/wallets.ts:135-141`
- Add i18n key for user-friendly error message

**Step 1: Improve API error message**

In `wallets.ts` line 136-141, change the error message to be user-friendly:

```typescript
if (!apiKey) {
  return reply.status(503).send({
    error: {
      code: "NOT_CONFIGURED",
      message: `Blockchain indexer for ${body.chain} is not configured. Please set ${isEthChain ? "ETHERSCAN_API_KEY" : "SOLSCAN_API_KEY"} in the server environment.`,
    },
  });
}
```

**Step 2: Five-step audit + commit**

---

### Task 8: Calendar-Based Holding Period Calculation

**Files:**

- Modify: `packages/tax-engine/src/methods/fifo.ts`
- Modify: All other method files (lifo, hifo, specific-id, germany-fifo, pmpa, total-average)
- Modify: `packages/tax-engine/src/__tests__/fifo.test.ts`

**Step 1: Write failing test for boundary case**

```typescript
// In fifo.test.ts — add test case
it("classifies exactly 1 calendar year as SHORT_TERM (IRS: more than 1 year)", () => {
  const lots = [
    createLot({
      id: "1",
      asset: "BTC",
      amount: 1,
      costBasisUsd: 10000,
      acquiredAt: new Date("2024-01-15"),
      sourceId: "s1",
    }),
  ];
  const event = createEvent({
    id: "s1",
    asset: "BTC",
    amount: 1,
    proceedsUsd: 15000,
    date: new Date("2025-01-15"), // Exactly 1 year — should be SHORT_TERM
    sourceId: "s1",
  });
  const result = calculateFIFO(lots, event);
  expect(result.holdingPeriod).toBe("SHORT_TERM");
});

it("classifies 1 year + 1 day as LONG_TERM", () => {
  const lots = [
    createLot({
      id: "1",
      asset: "BTC",
      amount: 1,
      costBasisUsd: 10000,
      acquiredAt: new Date("2024-01-15"),
      sourceId: "s1",
    }),
  ];
  const event = createEvent({
    id: "s1",
    asset: "BTC",
    amount: 1,
    proceedsUsd: 15000,
    date: new Date("2025-01-16"), // 1 year + 1 day — LONG_TERM
    sourceId: "s1",
  });
  const result = calculateFIFO(lots, event);
  expect(result.holdingPeriod).toBe("LONG_TERM");
});
```

**Step 2: Run tests to verify failure on boundary case**

**Step 3: Implement calendar-based holding period**

Replace `getHoldingPeriod` in all method files:

```typescript
function getHoldingPeriod(acquiredAt: Date, soldAt: Date): HoldingPeriod {
  // IRS rule: "more than one year" from the day after acquisition
  const dayAfter = new Date(acquiredAt);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const oneYearLater = new Date(dayAfter);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  return soldAt >= oneYearLater ? "LONG_TERM" : "SHORT_TERM";
}
```

Remove `ONE_YEAR_MS` constant.

**Step 4: Run all tests**

Run: `pnpm --filter @dtax/tax-engine test`

**Step 5: Five-step audit + commit**

---

### Task 9: Wrap-Unwrap Consumed Lot Check Fix

**Files:**

- Modify: `packages/tax-engine/src/normalizers/wrap-unwrap.ts:111`

**Step 1: Fix the fragile check**

Replace line 108-114:

```typescript
const originalAmount = lot.amount; // Save before mutation
lot.amount -= consumed;
lot.costBasisUsd -= basisConsumed;

if (consumed >= originalAmount - 0.00000001) {
  consumedLotIds.push(lot.id);
}
```

**Step 2: Run tests**

Run: `pnpm --filter @dtax/tax-engine test`

**Step 3: Five-step audit + commit**

---

### Task 10: DRY — Extract Shared Method Helpers

**Files:**

- Create: `packages/tax-engine/src/methods/shared.ts`
- Modify: All 7 method files to import from shared

**Step 1: Create shared module**

```typescript
// packages/tax-engine/src/methods/shared.ts
import type { HoldingPeriod } from "../types";

/**
 * IRS holding period: "more than one year" from day after acquisition.
 */
export function getHoldingPeriod(
  acquiredAt: Date,
  soldAt: Date,
): HoldingPeriod {
  const dayAfter = new Date(acquiredAt);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const oneYearLater = new Date(dayAfter);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return soldAt >= oneYearLater ? "LONG_TERM" : "SHORT_TERM";
}
```

**Step 2: Update all method files**

In each of the 7 method files, remove the local `getHoldingPeriod` and `ONE_YEAR_MS`, and add:

```typescript
import { getHoldingPeriod } from "./shared";
```

**Step 3: Run all tests — should still pass**

**Step 4: Five-step audit + commit**

---

### Task 11: Shared Types TxType Alignment

**Files:**

- Modify: `packages/tax-engine/src/parsers/types.ts`
- Modify: `packages/shared-types/src/index.ts` (add missing methods to TaxSummary)

**Step 1: Import TxType from shared-types in parsers/types.ts**

Replace the inline `type` union in `ParsedTransaction` with:

```typescript
import type { TxType } from "@dtax/shared-types";

export interface ParsedTransaction {
  // ...
  type: TxType;
  // ...
}
```

**Step 2: Update TaxSummary.method to include international methods**

```typescript
method: "FIFO" |
  "LIFO" |
  "HIFO" |
  "SPECIFIC_ID" |
  "GERMANY_FIFO" |
  "PMPA" |
  "TOTAL_AVERAGE" |
  (string & {});
```

**Step 3: Run tsc --noEmit for all packages, then tests**

**Step 4: Five-step audit + commit**

---

### Task 12: Risk Scanner — Backward Wash Sale Check

**Files:**

- Modify: `packages/tax-engine/src/risk-scanner.ts:138`
- Add test case

**Step 1: Write failing test**

```typescript
it("flags wash sale when purchase is BEFORE the loss sale", () => {
  const results = [
    /* loss sale result */
  ];
  const events = [
    /* buy 10 days before the loss sale */
  ];
  const risks = scanRisks(results, events);
  expect(risks.some((r) => r.type === "WASH_SALE")).toBe(true);
});
```

**Step 2: Fix the check**

Replace the time comparison:

```typescript
Math.abs(tx.timestamp.getTime() - lossTime) <= thirtyDaysMs &&
  tx.timestamp.getTime() !== lossTime;
```

**Step 3: Five-step audit + commit**

---

### Task 13: Notification Polling Visibility Check

**Files:**

- Modify: `apps/web/src/app/[locale]/notification-bell.tsx`

**Step 1: Add visibility-aware polling**

```typescript
useEffect(() => {
  fetchNotifications();
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") {
      fetchNotifications();
    }
  }, 30000);
  return () => clearInterval(interval);
}, []);
```

**Step 2: Five-step audit + commit**

---

### Task 14: Hardcoded i18n Strings Cleanup

**Files:**

- Modify: `apps/web/src/app/[locale]/tax/page.tsx` — "item"/"items", "Show More"
- Modify: `apps/web/src/app/[locale]/blog/[slug]/page.tsx` — "Back to Blog", "Last updated:"
- Modify: `apps/web/src/app/[locale]/nav.tsx` — "Blog"
- Modify: `apps/web/src/app/[locale]/page.tsx` — method display names, formatDate locale
- Add translation keys to all 7 locale files

**Step 1: Add keys to en.json, then copy pattern to other 6 locales**

**Step 2: Replace hardcoded strings with t() calls**

**Step 3: Five-step audit + commit**

---

## Execution Notes

- Each task ends with five-step audit: `tsc --noEmit` → tests → `next build` → commit → push
- Tasks 8 and 10 overlap (holding period) — Task 10 refactors what Task 8 implements
- Tasks are ordered by security impact first, then correctness, then quality
- Total: 14 tasks, estimated ~14 commits
