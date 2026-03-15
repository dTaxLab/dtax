# SEO + GEO + 内容营销 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 全面提升 dTax 在传统搜索引擎和 AI 搜索（GEO）中的可见性，通过 MDX 博客系统 + 结构化数据 + 常青内容 + GitHub/npm 优化建立内容营销漏斗。

**Architecture:** 分 5 个阶段：(1) JSON-LD 结构化数据扩展 (2) 页面级 SEO metadata (3) MDX 博客基础设施 (4) 常青内容批量生成 (5) GitHub/npm SEO 优化。每个阶段独立可交付、独立可测试。

**Tech Stack:** Next.js 16 App Router, next-mdx-remote, next-intl, schema.org JSON-LD, generateMetadata API

---

## Phase 1: JSON-LD 结构化数据扩展

### Task 1: Organization + BreadcrumbList 全站 schema

**Files:**

- Modify: `apps/web/src/app/[locale]/json-ld.tsx`

**Step 1: 扩展 JSON-LD 组件**

将现有 `json-ld.tsx` 从只有 SoftwareApplication 扩展为多 schema 支持：

```tsx
export function JsonLd() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "dTax",
    url: "https://dtax.ai",
    logo: "https://dtax.ai/logo-512.png",
    description: "Open source AI-powered crypto tax intelligence platform",
    sameAs: [
      "https://github.com/dTaxLab/dtax",
      "https://www.npmjs.com/package/@dtax/tax-engine",
    ],
    foundingDate: "2025",
    knowsAbout: [
      "Cryptocurrency taxation",
      "IRS Form 8949",
      "Cost basis calculation",
      "DeFi tax reporting",
    ],
  };

  const software = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "dTax",
    description:
      "Open source crypto tax calculator with FIFO, LIFO, HIFO, Specific ID methods. Form 8949, Schedule D, wash sale detection, and DeFi support.",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: "https://dtax.ai",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        name: "Free",
        description: "50 transactions, FIFO method, CSV export",
      },
      {
        "@type": "Offer",
        price: "49",
        priceCurrency: "USD",
        name: "Pro",
        description: "Unlimited transactions, all methods, PDF/TXF export",
        billingIncrement: "P1Y",
      },
      {
        "@type": "Offer",
        price: "199",
        priceCurrency: "USD",
        name: "CPA",
        description: "Multi-client management, white-label reports",
        billingIncrement: "P1Y",
      },
    ],
    featureList: [
      "23 exchange CSV parsers",
      "FIFO, LIFO, HIFO, Specific ID cost basis methods",
      "IRS Form 8949 generation (JSON, CSV, PDF, TXF)",
      "Schedule D summary",
      "Wash sale detection with 30-day window",
      "DeFi and NFT transaction support",
      "1099-DA reconciliation",
      "Tax impact simulator",
      "Multi-currency fiat support (10 currencies)",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organization).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(software).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
```

**Step 2: 添加 BreadcrumbList 组件**

在同一文件添加可复用的面包屑 schema：

```tsx
export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c"),
      }}
    />
  );
}
```

**Step 3: 验证构建**

Run: `cd apps/web && npx next build`
Expected: Build passes

**Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/json-ld.tsx
git commit -m "feat(seo): expand JSON-LD with Organization, enriched SoftwareApplication, BreadcrumbList"
```

---

### Task 2: FAQPage schema 到 FAQ 页面

**Files:**

- Modify: `apps/web/src/app/[locale]/json-ld.tsx`
- Modify: `apps/web/src/app/[locale]/faq/page.tsx`

**Step 1: 添加 FAQPage JSON-LD 组件**

在 `json-ld.tsx` 添加：

```tsx
export function FaqJsonLd({
  questions,
}: {
  questions: { question: string; answer: string }[];
}) {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
```

**Step 2: 在 FAQ 页面集成**

在 `faq/page.tsx` 中引入 `FaqJsonLd`，从 i18n 提取 Q&A 对并传入。由于 FAQ 内容在 i18n 中，需要在组件顶部用 `useTranslations` 提取所有问答对，构建数组传给 `FaqJsonLd`。

**Step 3: 验证**

Run: `cd apps/web && npx next build`

**Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/json-ld.tsx apps/web/src/app/[locale]/faq/page.tsx
git commit -m "feat(seo): add FAQPage schema to FAQ page for rich snippets"
```

---

## Phase 2: 页面级 SEO Metadata

### Task 3: 每个公开页面独立 generateMetadata

**Files:**

- Create: `apps/web/src/lib/seo.ts` — 共享 SEO 工具函数
- Modify: 8 个页面文件添加 generateMetadata

**Step 1: 创建 SEO 工具库**

```typescript
// apps/web/src/lib/seo.ts
import type { Metadata } from "next";

const BASE_URL = "https://dtax.ai";

export function buildMetadata({
  locale,
  title,
  description,
  path,
  keywords,
}: {
  locale: string;
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  const url = `${BASE_URL}/${locale}${path}`;
  const locales = ["en", "es", "pt", "ja", "zh", "zh-Hant", "ko"];
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `/${loc}${path}`;
  }

  return {
    title: `${title} | dTax`,
    description,
    keywords: keywords || ["crypto", "tax", "bitcoin", "FIFO", "capital gains"],
    alternates: { canonical: `/${locale}${path}`, languages },
    openGraph: {
      title,
      description,
      url,
      siteName: "dTax",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
```

**Step 2: 为每个页面添加 generateMetadata**

对于 "use client" 页面，需要拆分为 layout 或用 `generateMetadata` 在 page.tsx 之外的方式。由于 Next.js App Router 允许在 `page.tsx` 同目录放 `metadata.ts` 或在 layout 中导出，最简单的方式是在每个公开页面目录创建 `layout.tsx` 导出 metadata。

需要添加 metadata 的页面及其独立 title/description：

| 页面              | Title                                               | Description (EN)                                                                                                               |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/pricing`        | "Pricing — Free, Pro & CPA Plans"                   | "Compare dTax pricing plans. Free for 50 transactions, Pro $49/year for unlimited, CPA $199/year for multi-client management." |
| `/features`       | "Features — 23 Parsers, 4 Methods, DeFi Support"    | "Explore dTax features: 23 exchange parsers, FIFO/LIFO/HIFO/Specific ID, Form 8949, wash sale detection, DeFi/NFT support."    |
| `/faq`            | "FAQ — Frequently Asked Questions"                  | "Find answers about crypto tax calculation, IRS compliance, DeFi taxes, cost basis methods, and how dTax works."               |
| `/for-cpas`       | "For CPAs — Multi-Client Crypto Tax Management"     | "Manage multiple crypto tax clients. Batch reports, white-label exports, audit-ready documentation for tax professionals."     |
| `/security`       | "Security — Open Source, Self-Host, Zero-Knowledge" | "dTax security: open source code, self-hosting option, encrypted data, no access to your funds or exchange accounts."          |
| `/exchanges`      | "Supported Exchanges — 23 CSV Parsers"              | "Import from Coinbase, Binance, Kraken, Gemini, and 19 more exchanges. Auto-detect CSV format, DeFi on-chain support."         |
| `/docs`           | "Documentation — Self-Hosting Guide"                | "Set up dTax locally: prerequisites, quick start, environment variables, architecture overview, and troubleshooting."          |
| `/docs/changelog` | "Changelog — Version History"                       | "dTax release history from v0.40 to latest. New features, bug fixes, and improvements."                                        |

每个页面目录创建 `layout.tsx`，导出 `generateMetadata`，调用 `buildMetadata()`。

**Step 3: 验证**

Run: `cd apps/web && npx next build`

**Step 4: Commit**

```bash
git add apps/web/src/lib/seo.ts apps/web/src/app/[locale]/pricing/ apps/web/src/app/[locale]/features/ apps/web/src/app/[locale]/faq/ apps/web/src/app/[locale]/for-cpas/ apps/web/src/app/[locale]/security/ apps/web/src/app/[locale]/exchanges/ apps/web/src/app/[locale]/docs/
git commit -m "feat(seo): add page-level metadata for all public pages"
```

---

## Phase 3: MDX 博客基础设施

### Task 4: 安装 MDX 依赖 + 博客配置

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/content/blog/` 目录结构

**Step 1: 安装依赖**

```bash
cd apps/web && pnpm add next-mdx-remote gray-matter reading-time
```

**Step 2: 创建博客内容目录**

```
apps/web/content/blog/
├── en/
│   └── .gitkeep
├── zh/
│   └── .gitkeep
```

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/content/
git commit -m "feat(blog): add MDX dependencies and content directory structure"
```

---

### Task 5: 博客工具库 — MDX 解析 + 文章索引

**Files:**

- Create: `apps/web/src/lib/blog.ts`

**Step 1: 实现博客工具库**

```typescript
// apps/web/src/lib/blog.ts
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export interface BlogFrontmatter {
  title: string;
  description: string;
  date: string;
  updated?: string;
  author: string;
  tags: string[];
  category: string;
  image?: string;
}

export interface BlogPost {
  slug: string;
  locale: string;
  frontmatter: BlogFrontmatter;
  content: string;
  readingTime: string;
}

export interface BlogPostMeta {
  slug: string;
  locale: string;
  frontmatter: BlogFrontmatter;
  readingTime: string;
}

/** Get all posts for a locale, sorted by date descending */
export function getAllPosts(locale: string): BlogPostMeta[] {
  const dir = path.join(CONTENT_DIR, locale);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(dir, filename), "utf-8");
      const { data, content } = matter(raw);
      return {
        slug,
        locale,
        frontmatter: data as BlogFrontmatter,
        readingTime: readingTime(content).text,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.frontmatter.date).getTime() -
        new Date(a.frontmatter.date).getTime(),
    );
}

/** Get single post by slug and locale */
export function getPostBySlug(locale: string, slug: string): BlogPost | null {
  const filePath = path.join(CONTENT_DIR, locale, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug,
    locale,
    frontmatter: data as BlogFrontmatter,
    content,
    readingTime: readingTime(content).text,
  };
}

/** Get all slugs for generateStaticParams */
export function getAllSlugs(): { locale: string; slug: string }[] {
  const locales = fs.existsSync(CONTENT_DIR)
    ? fs
        .readdirSync(CONTENT_DIR)
        .filter((f) => fs.statSync(path.join(CONTENT_DIR, f)).isDirectory())
    : [];

  const slugs: { locale: string; slug: string }[] = [];
  for (const locale of locales) {
    const dir = path.join(CONTENT_DIR, locale);
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(".mdx")) {
        slugs.push({ locale, slug: file.replace(/\.mdx$/, "") });
      }
    }
  }
  return slugs;
}

/** Get all unique tags */
export function getAllTags(locale: string): string[] {
  const posts = getAllPosts(locale);
  const tags = new Set<string>();
  for (const post of posts) {
    for (const tag of post.frontmatter.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/blog.ts
git commit -m "feat(blog): add blog utility library with MDX parsing and indexing"
```

---

### Task 6: 博客列表页 + 文章详情页

**Files:**

- Create: `apps/web/src/app/[locale]/blog/page.tsx`
- Create: `apps/web/src/app/[locale]/blog/[slug]/page.tsx`
- Create: `apps/web/src/app/[locale]/blog/layout.tsx`
- Modify: `apps/web/src/app/sitemap.ts` — 添加博客 URL
- Modify: `apps/web/src/app/[locale]/nav.tsx` — 添加 Blog 导航链接

**Step 1: 博客列表页**

Server Component 页面，调用 `getAllPosts(locale)` 渲染文章列表。包含：

- 文章标题、描述、日期、阅读时间、标签
- 按分类筛选
- generateMetadata 输出博客专属 SEO

**Step 2: 文章详情页**

Server Component，使用 `next-mdx-remote` 渲染 MDX：

- `getPostBySlug()` 获取内容
- `MDXRemote` 渲染正文
- Article JSON-LD schema（datePublished, dateModified, author）
- 上/下篇导航
- generateMetadata 输出文章专属 title/description/OG

**Step 3: 博客 layout 导出 metadata**

```typescript
import { buildMetadata } from "@/lib/seo";
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    title: "Blog — Crypto Tax Guides & News",
    description:
      "Learn about crypto taxes, DeFi reporting, IRS compliance, and tax optimization strategies.",
    path: "/blog",
    keywords: [
      "crypto tax guide",
      "DeFi tax",
      "IRS crypto",
      "tax loss harvesting",
    ],
  });
}
```

**Step 4: 更新 sitemap**

在 `sitemap.ts` 中添加博客页面 URL（从 `getAllSlugs()` 动态生成）。

**Step 5: 导航添加 Blog 链接**

在 `nav.tsx` 的 More 下拉菜单中添加 Blog 链接。

**Step 6: 验证构建**

Run: `cd apps/web && npx next build`

**Step 7: Commit**

```bash
git add apps/web/src/app/[locale]/blog/ apps/web/src/app/sitemap.ts apps/web/src/app/[locale]/nav.tsx
git commit -m "feat(blog): add blog list page, article detail page with MDX rendering"
```

---

## Phase 4: 常青内容批量生成

### Task 7: 第一批核心内容（EN + ZH，10 篇）

**Files:**

- Create: `apps/web/content/blog/en/*.mdx` × 10
- Create: `apps/web/content/blog/zh/*.mdx` × 10

**内容规划 — 按 SEO 优先级排序：**

**Tier 1: 高搜索量关键词（消费者漏斗入口）**

| #   | Slug                            | 目标关键词                         | 类型     | GEO 策略                     |
| --- | ------------------------------- | ---------------------------------- | -------- | ---------------------------- |
| 1   | `how-to-file-crypto-taxes-2026` | "how to file crypto taxes"         | 教程     | 直接回答 + 分步 HowTo schema |
| 2   | `crypto-tax-calculator-guide`   | "crypto tax calculator"            | 工具指南 | 嵌入免费计算器 CTA           |
| 3   | `defi-tax-guide`                | "DeFi tax reporting"               | 深度指南 | 事实密度 + IRS 引用          |
| 4   | `form-8949-guide`               | "how to fill out Form 8949 crypto" | 教程     | HowTo schema + PDF 截图      |
| 5   | `fifo-vs-lifo-vs-hifo`          | "FIFO vs LIFO crypto tax"          | 对比     | 表格 + 计算示例              |

**Tier 2: 差异化内容（竞品未覆盖）**

| #   | Slug                     | 目标关键词                       | 类型     |
| --- | ------------------------ | -------------------------------- | -------- |
| 6   | `wash-sale-rule-crypto`  | "crypto wash sale rule 2026"     | 深度指南 |
| 7   | `1099-da-guide`          | "1099-DA crypto explained"       | 教程     |
| 8   | `specific-id-cost-basis` | "specific identification crypto" | 技术指南 |
| 9   | `dtax-vs-koinly`         | "dTax vs Koinly"                 | 对比页   |
| 10  | `dtax-vs-cointracker`    | "dTax vs CoinTracker"            | 对比页   |

**每篇文章结构（GEO 优化格式）：**

```
---
title: "How to File Crypto Taxes in 2026: Complete Guide"
description: "Step-by-step guide to filing cryptocurrency taxes..."
date: "2026-03-14"
updated: "2026-03-14"
author: "dTax Team"
tags: ["crypto tax", "filing", "IRS", "Form 8949"]
category: "guides"
---

[40-60 字直接回答目标问题 — GEO 优先抓取区]

## 主要章节

[每 150-200 字包含一个统计数据或 IRS 引用 — GEO fact density]

[引用权威来源: IRS.gov, Congress.gov — GEO 偏好外部引用]

## 常见问题

[FAQ 格式尾部 — 双重触发 FAQPage schema + GEO]
```

**Step 1: 使用 Claude API 生成 10 篇 EN 文章**

每篇 1500-2500 字，遵循上述 GEO 优化结构。

**Step 2: 翻译为 ZH 版本**

**Step 3: 人工快速审核（税务准确性检查）**

**Step 4: Commit**

```bash
git add apps/web/content/blog/
git commit -m "content(blog): add 10 evergreen crypto tax guides (EN + ZH)"
```

---

### Task 8: 第二批扩展内容（EN + ZH，10 篇）

**交易所教程系列（高长尾价值）：**

| #   | Slug                          | 目标关键词                         |
| --- | ----------------------------- | ---------------------------------- |
| 11  | `coinbase-tax-guide`          | "Coinbase tax reporting"           |
| 12  | `binance-tax-guide`           | "Binance tax reporting"            |
| 13  | `kraken-tax-guide`            | "Kraken tax export"                |
| 14  | `crypto-tax-loss-harvesting`  | "crypto tax loss harvesting"       |
| 15  | `nft-tax-guide`               | "NFT tax guide"                    |
| 16  | `staking-rewards-tax`         | "crypto staking tax"               |
| 17  | `turbotax-crypto-import`      | "import crypto taxes TurboTax"     |
| 18  | `open-source-crypto-tax`      | "open source crypto tax software"  |
| 19  | `crypto-tax-glossary`         | "crypto tax terms glossary"        |
| 20  | `cpa-crypto-tax-client-guide` | "CPA crypto tax client management" |

同样每篇 EN + ZH 双语版本。

---

## Phase 5: GitHub / npm SEO 优化

### Task 9: GitHub 仓库 SEO

**Files:**

- 通过 GitHub API/CLI 操作

**Step 1: 添加 GitHub Topics**

```bash
gh repo edit dTaxLab/dtax --add-topic crypto-tax,tax-calculator,cryptocurrency,typescript,form-8949,cost-basis,fifo,defi-tax,open-source,npm-package,capital-gains,schedule-d,wash-sale,bitcoin-tax,ethereum-tax
```

**Step 2: 优化 Repository Description**

```bash
gh repo edit dTaxLab/dtax --description "The only complete TypeScript crypto tax engine on npm — 23 exchange parsers, FIFO/LIFO/HIFO/Specific ID, Form 8949, wash sale detection, DeFi support"
```

**Step 3: Commit（如有文件变更）**

---

### Task 10: npm package.json 关键词优化

**Files:**

- Modify: `packages/tax-engine/package.json`
- Modify: `packages/cli/package.json`

**Step 1: 扩展 tax-engine keywords**

确保包含高搜索量的 npm 关键词：

```json
"keywords": [
  "crypto", "tax", "bitcoin", "cryptocurrency",
  "fifo", "lifo", "hifo", "specific-id", "cost-basis",
  "form-8949", "schedule-d", "wash-sale",
  "capital-gains", "tax-calculator", "tax-engine",
  "csv-parser", "ethereum", "defi", "nft",
  "coinbase", "binance", "kraken",
  "1099-da", "turbotax", "txf",
  "irs", "tax-reporting", "portfolio",
  "open-source", "typescript"
]
```

**Step 2: 优化 description**

```json
"description": "Complete crypto tax calculation engine — 23 exchange parsers, FIFO/LIFO/HIFO/Specific ID, Form 8949 (CSV/PDF/TXF), Schedule D, wash sale detection, DeFi/NFT support, 1099-DA reconciliation"
```

**Step 3: 更新 CLI package.json 同理**

**Step 4: Commit**

```bash
git add packages/tax-engine/package.json packages/cli/package.json
git commit -m "feat(npm): optimize package keywords and descriptions for npm search SEO"
```

---

## Phase 6: GEO 专项优化

### Task 11: 内容页面 GEO 结构优化

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`
- Modify: 各公开页面

**优化策略：**

1. **每个页面首屏 40-60 字直接回答**：Landing hero subtitle 从营销语改为事实描述
2. **"Last updated" 时间戳**：每个内容页面底部添加 `dateModified` 信息
3. **FAQ 尾部模式**：在 Features、Pricing、For CPAs 页面底部添加 2-3 个 FAQ（触发 FAQPage schema + GEO fact 抓取）
4. **统计数据嵌入**：在关键页面加入可验证的数据点（"23 exchange parsers", "800+ tests", "4 cost basis methods"）

**Step 1: 实施上述优化**

**Step 2: 验证构建**

**Step 3: Commit**

```bash
git commit -m "feat(geo): optimize content pages for AI search discovery"
```

---

### Task 12: robots.txt AI 爬虫策略

**Files:**

- Modify: `apps/web/src/app/robots.ts`

**Step 1: 添加 AI 爬虫允许规则**

```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/admin/",
          "/settings/",
          "/transactions/",
          "/tax/",
          "/portfolio/",
          "/reconcile/",
          "/compare/",
          "/transfers/",
        ],
      },
      // Explicitly allow AI crawlers to index public content
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "Google-Extended",
          "Claude-Web",
          "PerplexityBot",
          "Applebot-Extended",
        ],
        allow: ["/", "/blog/"],
        disallow: ["/api/", "/admin/", "/settings/"],
      },
    ],
    sitemap: "https://dtax.ai/sitemap.xml",
  };
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/robots.ts
git commit -m "feat(geo): add AI crawler rules to robots.txt for GEO optimization"
```

---

## 五步审计检查清单

每个 Phase 完成后执行：

1. `cd apps/api && npx tsc --noEmit` — API 类型检查
2. `cd apps/api && npx vitest run` — API 测试（285+）
3. `cd apps/web && npx tsc --noEmit` — Web 类型检查
4. `cd apps/web && npx next build` — Web 构建
5. `git log --oneline -5` — 确认提交历史

---

## 执行优先级

| Phase                  | 预估时间 | 依赖      | SEO 影响            |
| ---------------------- | -------- | --------- | ------------------- |
| Phase 1: JSON-LD       | 15min    | 无        | 🔴 高（富摘要）     |
| Phase 2: 页面 Metadata | 20min    | 无        | 🔴 高（搜索排名）   |
| Phase 3: MDX 博客      | 30min    | 无        | 🟡 中（基础设施）   |
| Phase 4: 内容生成      | 60min    | Phase 3   | 🔴 高（流量入口）   |
| Phase 5: GitHub/npm    | 10min    | 无        | 🟡 中（开发者漏斗） |
| Phase 6: GEO 优化      | 20min    | Phase 1-4 | 🔴 高（AI 搜索）    |
