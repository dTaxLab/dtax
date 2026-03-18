# CARF Content Marketing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CARF (Crypto-Asset Reporting Framework) content across all marketing pages to position dTax as "CARF-Ready", with full 7-locale i18n support.

**Architecture:** Content-only changes — add i18n keys to 7 locale JSON files, update page components to render new CARF sections. No API/backend changes needed.

**Tech Stack:** Next.js App Router, next-intl, TypeScript, Lucide icons, existing CSS utility classes

---

## Background: CARF Facts (Verified via Web Search 2026-03-18)

- **CARF**: OECD's Crypto-Asset Reporting Framework, modeled after CRS
- **48 jurisdictions** committed to first exchanges by 2027 (Early Adopters)
- **27 additional jurisdictions** by 2028
- **US participation**: 2029 (via IRS broker reporting rules)
- **67 total jurisdictions** committed as of 2026
- **Reportable**: crypto↔fiat, crypto↔crypto, retail payments >$50K, transfers
- **Key difference from CRS 1.0**: Covers DeFi, stablecoins, NFTs — not just custodial exchange accounts

---

## Existing CARF Content (已有内容)

| Location           | Key                            | Content                                               |
| ------------------ | ------------------------------ | ----------------------------------------------------- |
| FAQ page           | `faq.crsQ` / `faq.crsA`        | CRS 2.0 Q&A (brief, 1 paragraph)                      |
| Global Tax Rates   | `globalTaxRates.faq3Q/A`       | CARF impact on international holdings                 |
| Landing comparison | `landing.comparisonRegulatory` | "Regulatory Intelligence (MiCA, CRS 2.0, PARITY Act)" |

---

## Task 1: Add CARF FAQ Questions to FAQ Page

**Files:**

- Modify: `apps/web/src/app/[locale]/faq/page.tsx:44-50` (add 2 new question keys to taxIntelligence)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add 4 new i18n keys)

**Step 1: Add i18n keys to en.json**

Add after `"crsA"` (line 1009), before `"ctaText"`:

```json
"carfTimelineQ": "When does CARF take effect and which countries are participating?",
"carfTimelineA": "CARF (Crypto-Asset Reporting Framework) rolls out in three waves: 48 jurisdictions begin automatic crypto data exchange in 2027 (including UK, Germany, France, Japan, Australia, Canada, Singapore), 27 more join in 2028, and the US follows in 2029 via IRS broker reporting rules. In total, 67 jurisdictions have committed — covering over 95% of global crypto trading volume.",
"carfImpactQ": "How is CARF different from existing tax reporting, and how does dTax help?",
"carfImpactA": "Unlike CRS 1.0 which only covered custodial accounts, CARF covers DeFi protocols, stablecoins, NFTs, and crypto-to-crypto trades. Exchanges will report your full transaction history to tax authorities in your country of residence. dTax helps you stay ahead: our tax engine already supports all CARF-reportable transaction types, so you can review exactly what will be reported before it happens."
```

**Step 2: Add same keys to 6 other locale files**

Translate the 4 keys into zh, zh-Hant, es, ja, ko, pt. Insert at the same position (after `crsA`, before `ctaText`).

**Step 3: Add question keys to FAQ page component**

In `apps/web/src/app/[locale]/faq/page.tsx`, line 49, after `"crs"`:

```typescript
// Change line 44-50 from:
    questions: [
      "coveredNoncovered",
      "ordinaryIncome",
      "parityAct",
      "mica",
      "crs",
    ],
// To:
    questions: [
      "coveredNoncovered",
      "ordinaryIncome",
      "parityAct",
      "mica",
      "crs",
      "carfTimeline",
      "carfImpact",
    ],
```

**Step 4: Run five-step audit**

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/web exec tsc --noEmit
pnpm --filter @dtax/api test
node -e "for(const l of ['en','zh','zh-Hant','es','ja','ko','pt']){JSON.parse(require('fs').readFileSync('apps/web/messages/'+l+'.json','utf8'));console.log(l+' OK')}"
pnpm --filter @dtax/web build
```

**Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/faq/page.tsx apps/web/messages/
git commit -m "feat(faq): add CARF timeline and impact FAQ questions (7 locales)"
```

---

## Task 2: Add CARF Bullet to Features Page Global Compliance Section

**Files:**

- Modify: `apps/web/src/app/[locale]/features/page.tsx:115-119` (add 4th bullet key)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add 1 new key per locale)

**Step 1: Add i18n key to en.json**

Add after `"globalComplianceBullet3"` (line 878), before `"ctaTitle"`:

```json
"globalComplianceBullet4": "CARF-Ready — supports all reportable transaction types (crypto↔fiat, crypto↔crypto, DeFi, stablecoins) across 67 committed jurisdictions"
```

**Step 2: Add same key to 6 other locale files**

Translate `globalComplianceBullet4` into zh, zh-Hant, es, ja, ko, pt.

**Step 3: Add bullet key to features page component**

In `apps/web/src/app/[locale]/features/page.tsx`, change lines 115-119:

```typescript
// From:
    bulletKeys: [
      "globalComplianceBullet1",
      "globalComplianceBullet2",
      "globalComplianceBullet3",
    ],
// To:
    bulletKeys: [
      "globalComplianceBullet1",
      "globalComplianceBullet2",
      "globalComplianceBullet3",
      "globalComplianceBullet4",
    ],
```

**Step 4: Run five-step audit**

**Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/features/page.tsx apps/web/messages/
git commit -m "feat(features): add CARF-Ready bullet to global compliance section"
```

---

## Task 3: Add CARF-Ready Row to Landing Comparison Table

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx:86-91` (add new comparison row)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add 1 new key per locale)

**Step 1: Add i18n key to en.json**

Add after `"comparisonRegulatory"` (line 691), before `"comparisonInternationalMethods"`:

```json
"comparisonCarfReady": "CARF 2027 Ready (67 Jurisdictions)"
```

**Step 2: Add same key to 6 other locale files**

**Step 3: Add comparison row to landing.tsx**

After the `comparisonRegulatory` row (line 91), add:

```typescript
  {
    key: "comparisonCarfReady",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
```

**Step 4: Run five-step audit**

**Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/landing.tsx apps/web/messages/
git commit -m "feat(landing): add CARF-Ready comparison row"
```

---

## Task 4: Add CARF FAQ to For-CPAs Page

**Files:**

- Modify: `apps/web/src/app/[locale]/for-cpas/page.tsx:54-58` (add 4th FAQ)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add 2 new keys per locale in forCpas namespace)

**Step 1: Add i18n keys to en.json**

Add after existing `forCpas.faq3A`, before next key:

```json
"faq4Q": "How does CARF affect my CPA practice?",
"faq4A": "Starting 2027, tax authorities in 48+ countries will receive automatic reports of your clients' crypto transactions from exchanges. This means more clients will need professional help reconciling broker-reported data with their actual cost basis — especially for transferred or DeFi assets marked as \"noncovered.\" dTax's CPA dashboard lets you manage multiple clients with full audit trails, pre-matched 1099-DA reconciliation, and CARF-reportable transaction previews."
```

**Step 2: Add same keys to 6 other locale files**

**Step 3: Update for-cpas page component**

In `apps/web/src/app/[locale]/for-cpas/page.tsx`, change lines 54-58:

```typescript
// From:
const faqData = [
  { question: t("faq1Q"), answer: t("faq1A") },
  { question: t("faq2Q"), answer: t("faq2A") },
  { question: t("faq3Q"), answer: t("faq3A") },
];
// To:
const faqData = [
  { question: t("faq1Q"), answer: t("faq1A") },
  { question: t("faq2Q"), answer: t("faq2A") },
  { question: t("faq3Q"), answer: t("faq3A") },
  { question: t("faq4Q"), answer: t("faq4A") },
];
```

**Step 4: Run five-step audit**

**Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/for-cpas/page.tsx apps/web/messages/
git commit -m "feat(for-cpas): add CARF impact FAQ for CPA practice"
```

---

## Task 5: Enhance Existing CRS FAQ Answer with CARF Details

**Files:**

- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (update `faq.crsA` value)

**Step 1: Update en.json `crsA` value**

Replace existing `crsA` (line 1009) with expanded version:

```json
"crsA": "CRS 2.0 and its crypto-specific extension CARF (Crypto-Asset Reporting Framework) bring crypto assets into the global automatic exchange of financial information. Starting 2027, 48 jurisdictions will share crypto transaction data — including crypto-to-crypto trades, DeFi activity, stablecoins, and NFTs. By 2029, 67 jurisdictions (including the US) will participate, making crypto as transparent as bank accounts to tax authorities worldwide. dTax already supports all CARF-reportable transaction categories."
```

**Step 2: Update same key in 6 other locale files**

**Step 3: Run five-step audit**

**Step 4: Commit**

```bash
git add apps/web/messages/
git commit -m "feat(faq): expand CRS 2.0 answer with CARF details and timeline"
```

---

## Task 6: Add CARF Feature FAQ to Features Page

**Files:**

- Modify: `apps/web/src/app/[locale]/features/page.tsx:126-130` (add 4th FAQ)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add 2 new keys per locale in features namespace)

**Step 1: Add i18n keys to en.json**

Add after `"faq3A"` (line 887), before `"lastUpdated"`:

```json
"faq4Q": "Is dTax ready for CARF reporting in 2027?",
"faq4A": "Yes. dTax already supports all CARF-reportable transaction types: crypto-to-fiat, crypto-to-crypto, DeFi swaps, stablecoin transactions, and cross-border transfers. Our tax engine covers 7 cost basis methods across 15+ countries, and our regulatory intelligence tracks CARF adoption timelines for 67 committed jurisdictions."
```

**Step 2: Add same keys to 6 other locale files**

**Step 3: Update features page component**

In `apps/web/src/app/[locale]/features/page.tsx`, change lines 126-130:

```typescript
// From:
const faqData = [
  { question: t("faq1Q"), answer: t("faq1A") },
  { question: t("faq2Q"), answer: t("faq2A") },
  { question: t("faq3Q"), answer: t("faq3A") },
];
// To:
const faqData = [
  { question: t("faq1Q"), answer: t("faq1A") },
  { question: t("faq2Q"), answer: t("faq2A") },
  { question: t("faq3Q"), answer: t("faq3A") },
  { question: t("faq4Q"), answer: t("faq4A") },
];
```

**Step 4: Run five-step audit**

**Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/features/page.tsx apps/web/messages/
git commit -m "feat(features): add CARF readiness FAQ"
```

---

## Execution Order

1. **Task 1** — FAQ page: 2 new CARF questions (highest SEO value, FAQ pages rank well)
2. **Task 5** — Enhance existing CRS answer (quick win, improves existing content)
3. **Task 2** — Features page: CARF bullet (feature page authority)
4. **Task 6** — Features page: CARF FAQ (complements Task 2)
5. **Task 3** — Landing page: comparison row (conversion-focused)
6. **Task 4** — For-CPAs page: CARF FAQ (CPA segment targeting)

## i18n Translation Notes

All 7 locales: en, zh (简体中文), zh-Hant (繁體中文), es (Español), ja (日本語), ko (한국어), pt (Português)

Key translation considerations:

- CARF = 加密资产报告框架 (zh) / 暗号資産報告フレームワーク (ja) / 암호자산 보고 프레임워크 (ko)
- Keep acronym "CARF" in all locales (internationally recognized)
- "67 jurisdictions" — use local number formatting
- DeFi, NFT, stablecoin — keep English terms in all locales (industry standard)
