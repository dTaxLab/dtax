# Landing Page Glass & Aurora 改进 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 DTax landing page 添加 aurora 流动背景、glass morphism 卡片、滚动渐入动画，打造专业 fintech 视觉风格。

**Architecture:** 纯 CSS aurora 动画 + 全局 glass card 样式 + IntersectionObserver 滚动 hook。只修改 landing.tsx 和 globals.css，不影响 dashboard 等功能页面。竞品对比表只保留 DTax 赢的行，首页 pricing 精简为概览卡片。

**Tech Stack:** CSS @keyframes, CSS custom properties, backdrop-filter, React useEffect/useRef, IntersectionObserver API, Lucide React icons

---

### Task 1: Aurora 背景 CSS 动画

**Files:**

- Modify: `apps/web/src/app/globals.css` (末尾追加)

**Step 1: 在 globals.css 末尾添加 aurora 相关样式**

```css
/* ═══════════════════════════════════════════════
   Landing Page — Aurora & Glass Effects
   ═══════════════════════════════════════════════ */

/* Aurora background container */
.aurora {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.aurora-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  will-change: transform;
}

/* Blob 1 — accent indigo */
.aurora-blob-1 {
  width: 400px;
  height: 400px;
  background: var(--accent);
  opacity: 0.15;
  top: -10%;
  left: -5%;
  animation: aurora1 15s ease-in-out infinite alternate;
}

/* Blob 2 — cyan */
.aurora-blob-2 {
  width: 350px;
  height: 350px;
  background: #06b6d4;
  opacity: 0.12;
  bottom: -10%;
  right: -5%;
  animation: aurora2 18s ease-in-out infinite alternate;
}

/* Blob 3 — purple */
.aurora-blob-3 {
  width: 300px;
  height: 300px;
  background: #a855f7;
  opacity: 0.1;
  top: 30%;
  right: 20%;
  animation: aurora3 20s ease-in-out infinite alternate;
}

@keyframes aurora1 {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(80px, 60px) scale(1.3);
  }
}

@keyframes aurora2 {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(-100px, -80px) scale(1.2);
  }
}

@keyframes aurora3 {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(-60px, 40px) scale(1.3);
  }
}

/* Light mode — slightly stronger opacity */
[data-theme="light"] .aurora-blob-1 {
  opacity: 0.08;
}
[data-theme="light"] .aurora-blob-2 {
  opacity: 0.06;
}
[data-theme="light"] .aurora-blob-3 {
  opacity: 0.05;
}

/* Mobile — smaller blobs */
@media (max-width: 768px) {
  .aurora-blob-1 {
    width: 250px;
    height: 250px;
  }
  .aurora-blob-2 {
    width: 200px;
    height: 200px;
  }
  .aurora-blob-3 {
    width: 180px;
    height: 180px;
  }
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .aurora-blob {
    animation: none !important;
  }
}
```

**Step 2: 验证**

Run: `pnpm --filter @dtax/web exec tsc --noEmit`
Expected: 0 errors (CSS-only change)

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): add aurora background CSS animations for landing page"
```

---

### Task 2: Glass Card 全局样式

**Files:**

- Modify: `apps/web/src/app/globals.css` (在 Task 1 追加内容后继续追加)

**Step 1: 添加 glass card 样式**

```css
/* Glass card for landing/marketing pages */
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  padding: 24px;
  transition:
    border-color var(--duration-normal) var(--ease-default),
    box-shadow var(--duration-normal) var(--ease-default),
    transform var(--duration-normal) var(--ease-default);
}

.glass-card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.08);
  transform: translateY(-2px);
}

[data-theme="light"] .glass-card {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

[data-theme="light"] .glass-card:hover {
  border-color: rgba(99, 102, 241, 0.25);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.06);
}

/* Glass pill for trust bar */
.glass-pill {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 100px;
  padding: 8px 20px;
  transition: border-color var(--duration-normal) var(--ease-default);
}

[data-theme="light"] .glass-pill {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(0, 0, 0, 0.06);
}

/* Glass CTA button — hero only */
.btn-glass {
  background: rgba(99, 102, 241, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: var(--accent-light);
  transition: all var(--duration-normal) var(--ease-default);
}

.btn-glass:hover {
  background: rgba(99, 102, 241, 0.25);
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 24px rgba(99, 102, 241, 0.15);
  transform: translateY(-1px);
}

/* Glass table */
.glass-table {
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

[data-theme="light"] .glass-table {
  background: rgba(255, 255, 255, 0.5);
  border-color: rgba(0, 0, 0, 0.06);
}
```

**Step 2: 验证**

Run: `pnpm --filter @dtax/web exec tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): add glass morphism card, pill, button, and table styles"
```

---

### Task 3: 滚动渐入 Hook

**Files:**

- Create: `apps/web/src/hooks/use-scroll-reveal.ts`

**Step 1: 创建 hook 文件**

```typescript
"use client";

import { useEffect, useRef } from "react";

/**
 * Attaches IntersectionObserver to add `.revealed` class on first viewport entry.
 * Pair with CSS `.reveal` / `.revealed` classes for fade-in-up animation.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check prefers-reduced-motion
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) {
      el.classList.add("revealed");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
```

**Step 2: 在 globals.css 追加 reveal 动画类**

```css
/* Scroll reveal animation */
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 0.6s var(--ease-out),
    transform 0.6s var(--ease-out);
}

.reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered children */
.reveal-delay-1 {
  transition-delay: 0.1s;
}
.reveal-delay-2 {
  transition-delay: 0.2s;
}
.reveal-delay-3 {
  transition-delay: 0.3s;
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

**Step 3: 验证**

Run: `pnpm --filter @dtax/web exec tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add apps/web/src/hooks/use-scroll-reveal.ts apps/web/src/app/globals.css
git commit -m "feat(web): add useScrollReveal hook with IntersectionObserver animation"
```

---

### Task 4: Landing Page Hero 升级

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`

**Step 1: 重写 Hero section**

在 `LandingPage` 组件中修改 Hero section，加入 aurora 背景、glass CTA、改进排版：

```tsx
{
  /* Hero — with aurora background */
}
<section className="relative text-center section-py-xl overflow-hidden">
  {/* Aurora blobs */}
  <div className="aurora">
    <div className="aurora-blob aurora-blob-1" />
    <div className="aurora-blob aurora-blob-2" />
    <div className="aurora-blob aurora-blob-3" />
  </div>

  {/* Content — above aurora */}
  <div className="relative z-10">
    <p className="text-accent font-semibold text-sm uppercase tracking-wide mb-4">
      {t("heroTag")}
    </p>
    <h1
      className="font-extrabold mb-5 gradient-text leading-title"
      style={{ fontSize: "clamp(32px, 5vw, 56px)" }}
    >
      {t("heroTitle")}
    </h1>
    <p
      className="text-secondary leading-relaxed max-w-content mx-auto mb-8"
      style={{ fontSize: "clamp(16px, 2.5vw, 20px)" }}
    >
      {t("heroSubtitle")}
    </p>
    <div className="flex gap-3 justify-center flex-wrap">
      <Link
        href="/auth"
        className="btn btn-primary no-underline font-semibold btn-cta"
      >
        {t("ctaGetStarted")}
      </Link>
      <a
        href="https://github.com/dTaxLab/dtax"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-glass no-underline btn-cta"
      >
        {t("ctaGitHub")}
      </a>
    </div>
  </div>
</section>;
```

**注意：** 需要在 i18n 翻译文件中添加 `heroTag` key：

- EN: `"heroTag": "Open Source · Self-Hosted · IRS-Compliant"`
- ZH: `"heroTag": "开源 · 可自托管 · IRS 合规"`

**Step 2: 验证**

Run: `pnpm --filter @dtax/web exec tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add "apps/web/src/app/[locale]/landing.tsx"
git commit -m "feat(web): upgrade hero section with aurora background and glass CTA"
```

---

### Task 5: Trust Bar Glass Pills

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`

**Step 1: 修改 Trust Bar section**

将 trust bar 的 `<span>` 改为 glass pill 样式：

```tsx
{
  /* Trust Bar — glass pills */
}
<section className="flex justify-center flex-wrap gap-3 py-8 pb-12">
  {(
    ["trustGithub", "trustTests", "trustLicense", "trustExchanges"] as const
  ).map((key) => (
    <span
      key={key}
      className="glass-pill text-sm text-secondary flex items-center gap-2"
    >
      <Check size={14} className="text-gain" />
      {t(key)}
    </span>
  ))}
</section>;
```

去掉 `border-b`，因为 glass pill 已经有视觉分隔。

**Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/landing.tsx"
git commit -m "feat(web): convert trust bar to glass pill style"
```

---

### Task 6: Core Features → Glass Cards

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`

**Step 1: 修改 Core Features section**

将 `className="card text-center p-8 px-6"` 改为 `className="glass-card text-center p-8 px-6"`。

**Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/landing.tsx"
git commit -m "feat(web): convert core feature cards to glass morphism style"
```

---

### Task 7: 竞品对比表 — 只保留优势行

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`

**Step 1: 删除 DTax 输的行，保留赢的行**

从 `COMPARISON` 数组中删除以下行（DTax 不赢的）：

- `comparisonDefi` (3家都有)
- `comparisonWashSale` (3家都有)
- `comparisonForm8949` (3家都有)
- `comparisonExchanges` (20 vs 400+，短板)
- `comparisonIncomeReport` (3家都有)
- `comparisonPrice` (价格比较，可能误导)

保留的 7 行（DTax 独有或明显优势）：

```typescript
const COMPARISON: ComparisonRow[] = [
  {
    key: "comparisonOpenSource",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  { key: "comparisonSelfHost", dtax: true, koinly: false, cointracker: false },
  { key: "comparisonNft", dtax: true, koinly: true, cointracker: false },
  {
    key: "comparisonDefiParsers",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  { key: "comparison1099da", dtax: true, koinly: false, cointracker: false },
  {
    key: "comparisonSpecificId",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  {
    key: "comparisonCoveredNoncovered",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  {
    key: "comparisonRegulatoryAlerts",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
];
```

**Step 2: 将 `.table-container` 改为 `.glass-table`**

```tsx
<div className="glass-table">
  <table>...</table>
</div>
```

**Step 3: Commit**

```bash
git add "apps/web/src/app/[locale]/landing.tsx"
git commit -m "feat(web): optimize comparison table to show only DTax advantages with glass style"
```

---

### Task 8: Pricing Section 精简

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`

**Step 1: 精简 pricing section**

将完整的 pricing 卡片（含 5 feature 列表）精简为只显示计划名称 + 价格 + 一句话描述 + CTA 按钮。使用 glass card 样式。加一个 "View full comparison →" 链接到 `/pricing`。

```tsx
{
  /* Pricing — simplified glass cards */
}
<section className="py-8 pb-12">
  <h2 className="font-bold mb-8 text-center text-primary text-heading">
    {t("pricingTitle")}
  </h2>
  <div className="grid-3">
    {PRICING_PLANS.map((plan) => (
      <div
        key={plan.title}
        className="glass-card text-center p-8 px-6"
        style={{
          border: plan.highlight ? "2px solid var(--accent)" : undefined,
        }}
      >
        <h3 className="text-xl font-bold text-primary mb-2">
          {t(plan.title as Parameters<typeof t>[0])}
        </h3>
        <div className="text-4xl text-accent mb-2 font-extrabold">
          {t(plan.price as Parameters<typeof t>[0])}
        </div>
        <p className="text-sm text-muted mb-6">
          {t(plan.desc as Parameters<typeof t>[0])}
        </p>
        {plan.href.startsWith("mailto:") ? (
          <a
            href={plan.href}
            className={`${plan.highlight ? "btn btn-primary" : "btn btn-secondary"} no-underline w-full block`}
          >
            {t(plan.cta as Parameters<typeof t>[0])}
          </a>
        ) : (
          <Link
            href={plan.href}
            className={`${plan.highlight ? "btn btn-primary" : "btn btn-secondary"} no-underline w-full block`}
          >
            {t(plan.cta as Parameters<typeof t>[0])}
          </Link>
        )}
      </div>
    ))}
  </div>
  <p className="text-center mt-6">
    <Link href="/pricing" className="text-accent text-sm no-underline">
      {t("pricingCompareLink")} →
    </Link>
  </p>
</section>;
```

删除 `PRICING_PLANS` 中的 `features` 数组（首页不再需要），同时从常量定义和类型中移除 `features` 字段。

**注意：** 需要在 i18n 翻译文件中添加 `pricingCompareLink` key：

- EN: `"pricingCompareLink": "View full plan comparison"`
- ZH: `"pricingCompareLink": "查看完整方案对比"`

**Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/landing.tsx"
git commit -m "feat(web): simplify pricing section with glass cards and link to full comparison"
```

---

### Task 9: Exchange Pills Glass 化

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`

**Step 1: 修改 Exchange Coverage section**

将 exchange pill 的 className 从 `exchange-pill` 改为同时使用 glass 风格：

```tsx
<span
  key={name}
  className="text-sm font-medium text-secondary glass-pill"
  style={{ padding: "6px 16px" }}
>
  {name}
</span>
```

**Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/landing.tsx"
git commit -m "feat(web): apply glass pill style to exchange coverage tags"
```

---

### Task 10: 滚动渐入动画集成

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`

**Step 1: 为每个 section 添加 scroll reveal**

在 `LandingPage` 组件顶部导入 hook：

```typescript
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
```

为每个 section 创建 ref（Hero 除外，Hero 直接可见）：

```typescript
const trustRef = useScrollReveal();
const featuresRef = useScrollReveal();
const exchangesRef = useScrollReveal();
const comparisonRef = useScrollReveal();
const pricingRef = useScrollReveal();
const ctaRef = useScrollReveal();
```

给每个 section 添加 `ref={xxxRef}` 和 `className="reveal"`：

```tsx
<section ref={trustRef} className="reveal flex justify-center ...">
<section ref={featuresRef} className="reveal section-py-lg">
<section ref={exchangesRef} className="reveal text-center py-8 pb-12">
<section ref={comparisonRef} className="reveal py-8 pb-12">
<section ref={pricingRef} className="reveal py-8 pb-12">
<section ref={ctaRef} className="reveal text-center border-t section-py-lg">
```

**Step 2: 验证**

Run: `pnpm --filter @dtax/web exec tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add "apps/web/src/app/[locale]/landing.tsx"
git commit -m "feat(web): integrate scroll reveal animations into all landing page sections"
```

---

### Task 11: i18n Keys 更新

**Files:**

- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/zh.json`

**Step 1: 在 landing namespace 添加新 keys**

EN (`en.json` → `landing` object):

```json
"heroTag": "Open Source · Self-Hosted · IRS-Compliant",
"pricingCompareLink": "View full plan comparison"
```

ZH (`zh.json` → `landing` object):

```json
"heroTag": "开源 · 可自托管 · IRS 合规",
"pricingCompareLink": "查看完整方案对比"
```

**Step 2: 验证**

Run: `pnpm --filter @dtax/web exec tsc --noEmit && pnpm build`
Expected: 0 errors, 5/5 build

**Step 3: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/zh.json
git commit -m "feat(i18n): add heroTag and pricingCompareLink translation keys"
```

---

### Task 12: 五步法审计 + 最终验证

**Step 1: tsc**
Run: `pnpm --filter @dtax/web exec tsc --noEmit`
Expected: 0 errors

**Step 2: tests**
Run: `pnpm test`
Expected: 1113+ tests pass

**Step 3: security check**

- 确认无内部 `<a href>` 遗漏（所有内部链接用 i18n Link）
- 确认无 emoji 残留

**Step 4: domain check**

- 确认 aurora 动画有 `prefers-reduced-motion` 支持
- 确认 glass card dark/light 双模式适配
- 确认对比表只显示 DTax 优势行

**Step 5: build**
Run: `pnpm build`
Expected: 5/5 packages build 成功

**Step 6: Commit (if any fixes needed)**
