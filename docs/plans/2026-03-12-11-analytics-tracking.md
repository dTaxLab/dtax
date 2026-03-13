# 分析埋点 (PostHog) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 接入 PostHog 开源分析平台，追踪用户转化漏斗（注册→导入→计算→付费），支持产品决策。

**Architecture:** 前端集成 PostHog JS SDK。关键事件：page_view, signup, csv_import, tax_calculate, report_download, upgrade_click, subscription_created。自托管或 PostHog Cloud 均可。后端不埋点（前端 sufficient）。

**Tech Stack:** posthog-js, Next.js

---

### Task 1: 安装 PostHog SDK

**Step 1:**

Run: `cd apps/web && pnpm add posthog-js`

**Step 2: 创建 PostHog Provider**

```typescript
// apps/web/src/lib/analytics.ts
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (typeof window === "undefined" || !POSTHOG_KEY || initialized) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // 手动控制
    capture_pageleave: true,
    persistence: "localStorage",
  });
  initialized = true;
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (!POSTHOG_KEY) return; // graceful degradation
  posthog.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.identify(userId, traits);
}

export function resetAnalytics() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/analytics.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add PostHog analytics integration"
```

---

### Task 2: 初始化 & Page View 追踪

**Files:**

- Modify: `apps/web/src/app/[locale]/layout.tsx`

**Step 1: 在 layout 中初始化 PostHog**

```typescript
// 在 AuthProvider 内添加 useEffect
useEffect(() => {
  initAnalytics();
}, []);
```

**Step 2: Page view 追踪**

在 `nav.tsx` 或 layout 中使用 `usePathname()` 监听路由变化:

```typescript
const pathname = usePathname();
useEffect(() => {
  trackEvent("$pageview", { path: pathname });
}, [pathname]);
```

**Step 3: Commit**

---

### Task 3: 关键事件埋点

**Files:**

- Modify: `apps/web/src/lib/auth-context.tsx` (signup, login)
- Modify: `apps/web/src/app/[locale]/transactions/page.tsx` (csv_import)
- Modify: `apps/web/src/app/[locale]/tax/page.tsx` (tax_calculate, report_download)
- Modify: `apps/web/src/app/[locale]/settings/page.tsx` (upgrade_click)
- Modify: `apps/web/src/app/[locale]/onboarding/page.tsx` (onboarding_step)

**Step 1: 添加事件追踪调用**

```typescript
// auth-context.tsx — register 成功后
trackEvent("signup", { method: "email" });
identifyUser(user.id, { email: user.email, plan: "FREE" });

// auth-context.tsx — login 成功后
trackEvent("login");
identifyUser(user.id, { email: user.email });

// transactions — CSV 导入成功后
trackEvent("csv_import", { source: format, transactionCount: count });

// tax — 计算完成后
trackEvent("tax_calculate", { year, method, netGainLoss });

// tax — 下载报告
trackEvent("report_download", { type: "pdf" | "csv" | "txf", year, method });

// settings — 点击升级
trackEvent("upgrade_click", { targetPlan: "PRO" | "CPA" });

// onboarding — 每步完成
trackEvent("onboarding_step", { step: stepNumber, role, exchanges });
```

**Step 2: Commit**

---

### Task 4: 环境变量

**Files:**

- Modify: `.env.example`

```
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

---

### Task 5: 五步法审计

- 无 PostHog key 时 graceful degradation（不报错）
- 不追踪 PII（不发送交易金额、资产名等敏感数据）
- 遵守 cookie consent（如需要，添加 consent 检查）
- i18n: N/A（纯分析层）
- 构建: `pnpm build`
