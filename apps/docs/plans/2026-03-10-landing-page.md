# DTax Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a marketing landing page for unauthenticated visitors at the root URL, showcasing DTax's open-source, DeFi-focused crypto tax engine.

**Architecture:** Modify AuthGuard to bypass the root path for unauthenticated users. The existing `[locale]/page.tsx` will check auth state and conditionally render either LandingPage (guest) or Dashboard (logged in). The landing page is a single client component with i18n support, using the existing CSS variable design system.

**Tech Stack:** Next.js 14 App Router, next-intl, React, CSS variables (no new dependencies)

---

### Task 1: Add i18n messages for landing page (EN + ZH)

**Files:**

- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`

**Step 1: Add `landing` key block to `en.json`**

Add after the `"footer"` block:

```json
"landing": {
  "heroTitle": "Crypto Tax Clarity",
  "heroSubtitle": "Open-source, auditable, self-hostable. The crypto tax engine built for DeFi users who don't trust black boxes.",
  "ctaGetStarted": "Get Started — Free",
  "ctaGitHub": "View on GitHub",
  "ctaCpa": "For Tax Professionals",
  "trustGithub": "Open Source on GitHub",
  "trustTests": "680+ Tests",
  "trustLicense": "AGPL-3.0 Licensed",
  "trustExchanges": "20 Exchanges",
  "featureOpenSourceTitle": "Open Source & Auditable",
  "featureOpenSourceDesc": "Every tax calculation is transparent. Verify the logic yourself — no black-box algorithms, no hidden assumptions.",
  "featureDefiTitle": "DeFi Native",
  "featureDefiDesc": "DEX swaps, LP positions, staking, bridges, wraps, NFTs — all handled with correct cost basis tracking.",
  "featureSelfHostTitle": "Self-Hostable",
  "featureSelfHostDesc": "Your financial data stays on your server. Docker deploy in minutes. No third-party data sharing.",
  "exchangesCovered": "20 Exchanges & Chains Supported",
  "comparisonTitle": "How DTax Compares",
  "comparisonFeature": "Feature",
  "comparisonOpenSource": "Open Source",
  "comparisonSelfHost": "Self-Hostable",
  "comparisonDefi": "DeFi Support",
  "comparisonWashSale": "Wash Sale Detection",
  "comparisonForm8949": "Form 8949 + Schedule D",
  "comparison1099da": "1099-DA Reconciliation",
  "comparisonSpecificId": "Specific ID Lot Selection",
  "comparisonExchanges": "Exchange Parsers",
  "comparisonPrice": "Starting Price",
  "comparisonFree": "Free",
  "pricingTitle": "Simple, Honest Pricing",
  "pricingFreeTitle": "Community",
  "pricingFreePrice": "Free Forever",
  "pricingFreeDesc": "Full engine, 50 transactions/tax year",
  "pricingFreeCta": "Get Started",
  "pricingFreeF1": "All 20 exchange parsers",
  "pricingFreeF2": "FIFO / LIFO / HIFO / Specific ID",
  "pricingFreeF3": "Form 8949 + Schedule D",
  "pricingFreeF4": "Wash sale detection",
  "pricingFreeF5": "Self-host with Docker",
  "pricingProTitle": "Pro",
  "pricingProPrice": "$49 / tax year",
  "pricingProDesc": "Unlimited transactions, full reports",
  "pricingProCta": "Start Free Trial",
  "pricingProF1": "Everything in Community",
  "pricingProF2": "Unlimited transactions",
  "pricingProF3": "PDF report export",
  "pricingProF4": "1099-DA reconciliation",
  "pricingProF5": "Priority support",
  "pricingCpaTitle": "Tax Professional",
  "pricingCpaPrice": "$199 / year / seat",
  "pricingCpaDesc": "Multi-client management for CPAs",
  "pricingCpaCta": "Contact Sales",
  "pricingCpaF1": "Everything in Pro",
  "pricingCpaF2": "Multi-client dashboard",
  "pricingCpaF3": "Bulk import & export",
  "pricingCpaF4": "White-label reports",
  "pricingCpaF5": "Dedicated support + SLA",
  "footerCta": "Ready to calculate your crypto taxes?",
  "footerCtaBtn": "Get Started — It's Free"
}
```

**Step 2: Add `landing` key block to `zh.json`**

Same structure, Chinese translations:

```json
"landing": {
  "heroTitle": "加密税务，清晰透明",
  "heroSubtitle": "开源、可审计、可自托管。为不信任黑箱算法的 DeFi 用户而生。",
  "ctaGetStarted": "免费开始",
  "ctaGitHub": "在 GitHub 查看",
  "ctaCpa": "税务专业人士入口",
  "trustGithub": "GitHub 开源",
  "trustTests": "680+ 测试用例",
  "trustLicense": "AGPL-3.0 许可",
  "trustExchanges": "20 交易所",
  "featureOpenSourceTitle": "开源可审计",
  "featureOpenSourceDesc": "每一笔税务计算完全透明。自行验证逻辑——无黑箱算法，无隐藏假设。",
  "featureDefiTitle": "DeFi 原生支持",
  "featureDefiDesc": "DEX 交易、LP 头寸、质押、跨链桥、Wrap、NFT——全部正确追踪成本基准。",
  "featureSelfHostTitle": "可自托管",
  "featureSelfHostDesc": "你的财务数据留在自己的服务器。Docker 一键部署，无需共享给第三方。",
  "exchangesCovered": "支持 20+ 交易所与区块链",
  "comparisonTitle": "DTax 对比竞品",
  "comparisonFeature": "功能",
  "comparisonOpenSource": "开源",
  "comparisonSelfHost": "可自托管",
  "comparisonDefi": "DeFi 支持",
  "comparisonWashSale": "Wash Sale 检测",
  "comparisonForm8949": "Form 8949 + Schedule D",
  "comparison1099da": "1099-DA 对账",
  "comparisonSpecificId": "Specific ID 选批",
  "comparisonExchanges": "交易所解析器",
  "comparisonPrice": "起始价格",
  "comparisonFree": "免费",
  "pricingTitle": "简单透明的定价",
  "pricingFreeTitle": "社区版",
  "pricingFreePrice": "永久免费",
  "pricingFreeDesc": "完整引擎，每税年 50 笔交易",
  "pricingFreeCta": "免费开始",
  "pricingFreeF1": "全部 20 种交易所解析器",
  "pricingFreeF2": "FIFO / LIFO / HIFO / Specific ID",
  "pricingFreeF3": "Form 8949 + Schedule D",
  "pricingFreeF4": "Wash Sale 检测",
  "pricingFreeF5": "Docker 自托管部署",
  "pricingProTitle": "专业版",
  "pricingProPrice": "$49 / 税年",
  "pricingProDesc": "无限交易，完整报告",
  "pricingProCta": "免费试用",
  "pricingProF1": "包含社区版全部功能",
  "pricingProF2": "无限交易数量",
  "pricingProF3": "PDF 报告导出",
  "pricingProF4": "1099-DA 对账",
  "pricingProF5": "优先技术支持",
  "pricingCpaTitle": "税务专业版",
  "pricingCpaPrice": "$199 / 年 / 席位",
  "pricingCpaDesc": "CPA 多客户管理面板",
  "pricingCpaCta": "联系销售",
  "pricingCpaF1": "包含专业版全部功能",
  "pricingCpaF2": "多客户管理面板",
  "pricingCpaF3": "批量导入导出",
  "pricingCpaF4": "白标报告",
  "pricingCpaF5": "专属支持 + SLA",
  "footerCta": "准备好计算你的加密税务了吗？",
  "footerCtaBtn": "免费开始使用"
}
```

**Step 3: Verify build**

Run: `cd /Users/ericw/project/dtax && pnpm --filter @dtax/web build`
Expected: Build succeeds (i18n messages are valid JSON)

**Step 4: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "feat(web): add i18n messages for landing page (EN + ZH)"
```

---

### Task 2: Create LandingPage component

**Files:**

- Create: `apps/web/src/app/[locale]/landing.tsx`

**Context:**

- This is a React client component (not a route — no `page.tsx`)
- Uses `useTranslations("landing")` for all text
- Uses existing CSS variables from `globals.css`
- All styles inline or using existing CSS classes (`.card`, `.btn-primary`, `.btn-secondary`, `.grid-3`, `.animate-in`)
- Links to `/auth` for sign-up, `https://github.com/dTaxLab/dtax` for GitHub

**Step 1: Create the component file**

```tsx
"use client";

import { useTranslations } from "next-intl";

const EXCHANGES = [
  "Coinbase",
  "Binance",
  "Kraken",
  "Gemini",
  "Crypto.com",
  "KuCoin",
  "OKX",
  "Bybit",
  "Gate.io",
  "Bitget",
  "MEXC",
  "HTX",
  "Bitfinex",
  "Poloniex",
  "Etherscan",
  "Solscan",
  "Generic CSV",
];

const COMPARISON = [
  {
    key: "comparisonOpenSource",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  { key: "comparisonSelfHost", dtax: true, koinly: false, cointracker: false },
  { key: "comparisonDefi", dtax: true, koinly: true, cointracker: true },
  { key: "comparisonWashSale", dtax: true, koinly: true, cointracker: true },
  { key: "comparisonForm8949", dtax: true, koinly: true, cointracker: true },
  { key: "comparison1099da", dtax: true, koinly: false, cointracker: false },
  {
    key: "comparisonSpecificId",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  {
    key: "comparisonExchanges",
    dtax: "20",
    koinly: "400+",
    cointracker: "300+",
  },
  {
    key: "comparisonPrice",
    dtax: "comparisonFree",
    koinly: "$49",
    cointracker: "$59",
  },
];

export function LandingPage() {
  const t = useTranslations("landing");

  return (
    <div className="animate-in">
      {/* ── Hero ── */}
      <section style={{ textAlign: "center", padding: "80px 0 48px" }}>
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: "20px",
            background: "linear-gradient(135deg, var(--accent), #a78bfa)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {t("heroTitle")}
        </h1>
        <p
          style={{
            fontSize: "clamp(16px, 2.5vw, 20px)",
            color: "var(--text-secondary)",
            maxWidth: "640px",
            margin: "0 auto 32px",
            lineHeight: 1.6,
          }}
        >
          {t("heroSubtitle")}
        </p>
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="auth"
            className="btn btn-primary"
            style={{
              textDecoration: "none",
              padding: "14px 32px",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            {t("ctaGetStarted")}
          </a>
          <a
            href="https://github.com/dTaxLab/dtax"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{
              textDecoration: "none",
              padding: "14px 32px",
              fontSize: "16px",
            }}
          >
            {t("ctaGitHub")}
          </a>
        </div>
      </section>

      {/* ── Trust Bar ── */}
      <section
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "32px",
          flexWrap: "wrap",
          padding: "24px 0 48px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {(
          [
            "trustGithub",
            "trustTests",
            "trustLicense",
            "trustExchanges",
          ] as const
        ).map((key) => (
          <span
            key={key}
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span style={{ color: "var(--green)", fontSize: "16px" }}>✓</span>
            {t(key)}
          </span>
        ))}
      </section>

      {/* ── 3 Core Features ── */}
      <section style={{ padding: "48px 0" }}>
        <div className="grid-3">
          {(
            [
              {
                title: "featureOpenSourceTitle",
                desc: "featureOpenSourceDesc",
                icon: "🔍",
              },
              {
                title: "featureDefiTitle",
                desc: "featureDefiDesc",
                icon: "🔗",
              },
              {
                title: "featureSelfHostTitle",
                desc: "featureSelfHostDesc",
                icon: "🏠",
              },
            ] as const
          ).map((f) => (
            <div
              key={f.title}
              className="card"
              style={{ padding: "32px 24px", textAlign: "center" }}
            >
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>
                {f.icon}
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "8px",
                  color: "var(--text-primary)",
                }}
              >
                {t(f.title)}
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {t(f.desc)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Exchange Coverage ── */}
      <section style={{ padding: "32px 0 48px", textAlign: "center" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "24px",
            color: "var(--text-primary)",
          }}
        >
          {t("exchangesCovered")}
        </h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            justifyContent: "center",
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
          {EXCHANGES.map((name) => (
            <span
              key={name}
              style={{
                padding: "6px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 500,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Comparison Table ── */}
      <section style={{ padding: "32px 0 48px" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "24px",
            textAlign: "center",
            color: "var(--text-primary)",
          }}
        >
          {t("comparisonTitle")}
        </h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t("comparisonFeature")}</th>
                <th style={{ textAlign: "center", color: "var(--accent)" }}>
                  DTax
                </th>
                <th style={{ textAlign: "center" }}>Koinly</th>
                <th style={{ textAlign: "center" }}>CoinTracker</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.key}>
                  <td>{t(row.key as keyof IntlMessages["landing"])}</td>
                  {[row.dtax, row.koinly, row.cointracker].map((val, i) => (
                    <td key={i} style={{ textAlign: "center" }}>
                      {val === true ? (
                        <span style={{ color: "var(--green)" }}>✓</span>
                      ) : val === false ? (
                        <span style={{ color: "var(--text-muted)" }}>✗</span>
                      ) : (
                        <span>
                          {row.key === "comparisonPrice" && i === 0
                            ? t(val as keyof IntlMessages["landing"])
                            : val}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ padding: "32px 0 48px" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "32px",
            textAlign: "center",
            color: "var(--text-primary)",
          }}
        >
          {t("pricingTitle")}
        </h2>
        <div className="grid-3">
          {(
            [
              {
                title: "pricingFreeTitle",
                price: "pricingFreePrice",
                desc: "pricingFreeDesc",
                cta: "pricingFreeCta",
                href: "auth",
                highlight: false,
                features: [
                  "pricingFreeF1",
                  "pricingFreeF2",
                  "pricingFreeF3",
                  "pricingFreeF4",
                  "pricingFreeF5",
                ],
              },
              {
                title: "pricingProTitle",
                price: "pricingProPrice",
                desc: "pricingProDesc",
                cta: "pricingProCta",
                href: "auth",
                highlight: true,
                features: [
                  "pricingProF1",
                  "pricingProF2",
                  "pricingProF3",
                  "pricingProF4",
                  "pricingProF5",
                ],
              },
              {
                title: "pricingCpaTitle",
                price: "pricingCpaPrice",
                desc: "pricingCpaDesc",
                cta: "pricingCpaCta",
                href: "mailto:hello@dtax.ai",
                highlight: false,
                features: [
                  "pricingCpaF1",
                  "pricingCpaF2",
                  "pricingCpaF3",
                  "pricingCpaF4",
                  "pricingCpaF5",
                ],
              },
            ] as const
          ).map((plan) => (
            <div
              key={plan.title}
              className="card"
              style={{
                padding: "32px 24px",
                textAlign: "center",
                border: plan.highlight ? "2px solid var(--accent)" : undefined,
                position: "relative",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "8px",
                }}
              >
                {t(plan.title)}
              </h3>
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  color: "var(--accent)",
                  marginBottom: "8px",
                }}
              >
                {t(plan.price)}
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "24px",
                }}
              >
                {t(plan.desc)}
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 24px",
                  textAlign: "left",
                }}
              >
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      padding: "6px 0",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span style={{ color: "var(--green)", flexShrink: 0 }}>
                      ✓
                    </span>
                    {t(f)}
                  </li>
                ))}
              </ul>
              <a
                href={plan.href}
                className={
                  plan.highlight ? "btn btn-primary" : "btn btn-secondary"
                }
                style={{
                  textDecoration: "none",
                  width: "100%",
                  display: "block",
                }}
              >
                {t(plan.cta)}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        style={{
          textAlign: "center",
          padding: "48px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "16px",
            color: "var(--text-primary)",
          }}
        >
          {t("footerCta")}
        </h2>
        <a
          href="auth"
          className="btn btn-primary"
          style={{
            textDecoration: "none",
            padding: "14px 40px",
            fontSize: "16px",
            fontWeight: 600,
          }}
        >
          {t("footerCtaBtn")}
        </a>
      </section>
    </div>
  );
}
```

**Note on type safety:** The `t(row.key as keyof IntlMessages["landing"])` cast is needed because `COMPARISON` keys are dynamic strings. This is safe because all keys exist in the i18n messages added in Task 1.

**Step 2: Verify build**

Run: `cd /Users/ericw/project/dtax && pnpm --filter @dtax/web build`
Expected: Build succeeds (component not yet mounted, so no runtime errors to check)

**Step 3: Commit**

```bash
git add apps/web/src/app/\[locale\]/landing.tsx
git commit -m "feat(web): create LandingPage component with hero, features, pricing"
```

---

### Task 3: Wire up AuthGuard + page.tsx to show landing page

**Files:**

- Modify: `apps/web/src/app/[locale]/auth-guard.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`

**Step 1: Modify AuthGuard to bypass root path**

In `auth-guard.tsx`, the root path for each locale is `/{locale}` (e.g., `/en`, `/zh`). The pathname from `usePathname()` will be `/en` or `/zh` for the root.

Change the guard to also bypass the root path:

```tsx
// Current (line 13):
if (pathname.endsWith("/auth")) {
  return <>{children}</>;
}

// Change to:
const segments = pathname.split("/").filter(Boolean);
// bypass: /auth pages and root (locale-only, e.g. /en, /zh)
if (pathname.endsWith("/auth") || segments.length <= 1) {
  return <>{children}</>;
}
```

This means `/en` → segments = `["en"]` → length 1 → bypass. `/en/transactions` → segments = `["en", "transactions"]` → length 2 → guarded.

**Step 2: Modify page.tsx to conditionally render**

At the top of `page.tsx`, add:

```tsx
import { useAuth } from "@/lib/auth-context";
import { LandingPage } from "./landing";
```

Inside the `Dashboard` component, add auth check as the first lines:

```tsx
export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  // ... existing hooks ...

  // Unauthenticated → landing page
  if (!user && !authLoading) {
    return <LandingPage />;
  }

  // Auth loading state
  if (authLoading) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="loading-pulse" style={{ fontSize: "48px" }}>🧮</div>
        <p style={{ color: "var(--text-muted)", marginTop: "16px" }}>{tc("loading")}</p>
      </div>
    );
  }

  // ... rest of existing Dashboard code ...
```

**Step 3: Verify build**

Run: `cd /Users/ericw/project/dtax && pnpm --filter @dtax/web build`
Expected: Build succeeds

**Step 4: Manual test**

Tell user to run:

```bash
pnpm --filter @dtax/web dev
```

Then visit `http://localhost:3000` without logging in — should see landing page.
Log in — should see dashboard.

**Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/auth-guard.tsx apps/web/src/app/\[locale\]/page.tsx
git commit -m "feat(web): show landing page for unauthenticated visitors"
```

---

### Task 4: Hide nav for unauthenticated users on landing page

**Files:**

- Modify: `apps/web/src/app/[locale]/nav.tsx`

**Context:** The full navigation (Dashboard, Transactions, etc.) shouldn't show on the landing page. Instead, show a minimal header with just the DTax logo, locale switcher, theme toggle, and a "Sign In" link.

**Step 1: Modify nav.tsx**

Add auth check at the top of the component:

```tsx
import { useAuth } from "@/lib/auth-context";
```

Inside the component, add:

```tsx
const { user } = useAuth();
```

Conditionally render nav links: if `!user`, hide the main navigation links and show a "Sign In" link instead. Wrap the existing links `<div>` with:

```tsx
{user ? (
  // existing nav links div
) : (
  <div className="nav-links">
    <a href="auth" className="nav-link" style={{ fontWeight: 600, color: "var(--accent)" }}>
      Sign In
    </a>
  </div>
)}
```

Keep the locale switcher and theme toggle visible in both states.

**Step 2: Verify build**

Run: `cd /Users/ericw/project/dtax && pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/\[locale\]/nav.tsx
git commit -m "feat(web): show minimal nav for unauthenticated landing page visitors"
```

---

### Task 5: Add landing page responsive CSS

**Files:**

- Modify: `apps/web/src/app/globals.css`

**Context:** The landing page uses existing `.grid-3`, `.card`, `.table-container` classes which are already responsive. However, the hero section and pricing cards may need additional responsive tweaks.

**Step 1: Add landing-specific responsive rules**

Add inside the existing `@media (max-width: 768px)` block (or after it):

```css
/* Landing page responsive */
@media (max-width: 600px) {
  .grid-3 {
    grid-template-columns: 1fr;
  }
}
```

Check if `.grid-3` already has a responsive rule at 768px. If it does (e.g., goes to 2 columns), add the 600px rule to force single column on very small screens.

Also verify that the comparison table scrolls horizontally on mobile (the `.table-container` class should already handle this with `overflow-x: auto`).

**Step 2: Verify build**

Run: `cd /Users/ericw/project/dtax && pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): landing page responsive breakpoints"
```

---

### Task 6: Type check + final verification

**Files:** None (verification only)

**Step 1: Run TypeScript type check**

Run: `cd /Users/ericw/project/dtax && pnpm --filter @dtax/web exec tsc --noEmit`
Expected: 0 errors

**Step 2: Run full build**

Run: `cd /Users/ericw/project/dtax && pnpm --filter @dtax/web build`
Expected: Build succeeds

**Step 3: Run all existing tests**

Run: `cd /Users/ericw/project/dtax && pnpm test`
Expected: All 687+ tests pass (no test changes needed — landing page is pure frontend)

---

## Architecture Decisions

1. **No new route** — Landing page is the same URL as Dashboard (`/`), conditionally rendered based on auth state. This avoids duplicate routes and keeps the URL clean.

2. **AuthGuard bypass** — Root path (`/en`, `/zh`) bypasses the guard so the page.tsx component controls what to show. All other routes still require auth.

3. **No new dependencies** — Uses existing CSS variables, existing i18n system, existing component patterns. No CSS framework, no animation library.

4. **Inline styles** — Following the existing project pattern (pages use inline styles, not CSS modules). Only global layout concerns go in `globals.css`.

5. **Pricing is static** — No backend integration for payments. Pricing cards are informational. "Contact Sales" links to mailto. This is appropriate for an early-stage landing page.
