# CARF Features Implementation Plan (Project 2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CARF compliance features: countdown on tax page, CARF adoption dates on global-tax-rates, UK Share Pooling method, and CARF transaction export.

**Architecture:** Mix of frontend content (tax page, global-tax-rates) + tax engine method (UK Share Pooling) + API endpoint (CRS export). All with i18n.

**Tech Stack:** TypeScript, tax-engine (Vitest), Fastify API, Next.js, next-intl

---

## Task 1: Add CARF 2027 Countdown to Tax Page Regulatory Alerts

**Files:**

- Modify: `apps/web/src/app/[locale]/tax/page.tsx:355-396` (add CARF section after stakingTax)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add 4 i18n keys in tax.regulatory)

Add a new regulatory section showing CARF countdown with days remaining until Jan 1, 2027.

**i18n keys (tax namespace, regulatory object):**

```json
"carf2027": {
  "title": "CARF 2027 — Global Crypto Reporting",
  "countdown": "{days} days until CARF auto-exchange begins",
  "description": "Starting January 2027, 48 jurisdictions will automatically share your crypto transaction data with tax authorities. This includes crypto-to-fiat, crypto-to-crypto, DeFi, and stablecoin transactions. By 2029, 67 jurisdictions (including the US) will participate.",
  "action": "Ensure your records are complete and cost basis is accurate before reporting begins."
}
```

**TSX (insert after stakingTax div, before closing </div>):**

```tsx
<div>
  <div className="font-semibold text-sm mb-1 flex items-center gap-2">
    {t("regulatory.carf2027.title")}
    <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-on-accent">
      {t("regulatory.carf2027.countdown", {
        days: Math.max(
          0,
          Math.ceil((new Date("2027-01-01").getTime() - Date.now()) / 86400000),
        ),
      })}
    </span>
  </div>
  <p className="text-sm text-secondary mb-2">
    {t("regulatory.carf2027.description")}
  </p>
  <p className="text-sm text-accent font-medium">
    {t("regulatory.carf2027.action")}
  </p>
</div>
```

---

## Task 2: Add CARF Adoption Dates to Global Tax Rates Page

**Files:**

- Modify: `apps/web/src/app/[locale]/global-tax-rates/page.tsx` (add carfYear to CountryTaxInfo, add column)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add header + status keys in globalTaxRates)

Add `carfYear` field to each country and a new "CARF Status" column in the comparison table.

**CountryTaxInfo type extension:**

```typescript
type CountryTaxInfo = {
  countryKey: string;
  flag: string;
  rateKey: string;
  methodKey: string;
  holdingBenefitKey: string;
  specialRuleKey: string;
  blogSlug: string | null;
  carfYear: number; // 2027, 2028, or 2029
};
```

**CARF years per country:**

- 2027: Germany, France, UK, Japan, Australia, Canada, Italy, Spain, Netherlands, South Korea, Singapore, South Africa, Brazil
- 2028: India
- 2029: US

**i18n keys (globalTaxRates):**

```json
"carfStatus": "CARF Status",
"carfYear2027": "2027 — Early Adopter",
"carfYear2028": "2028 — Second Wave",
"carfYear2029": "2029 — US (IRS Rules)"
```

---

## Task 3: Implement UK Share Pooling Cost Basis Method

**Files:**

- Create: `packages/tax-engine/src/methods/uk-share-pooling.ts`
- Modify: `packages/tax-engine/src/calculator.ts` (add UK_SHARE_POOLING case)
- Modify: `packages/tax-engine/src/index.ts` (export)
- Create: `packages/tax-engine/src/__tests__/uk-share-pooling.test.ts`

**UK Share Pooling Rules (HMRC Section 104):**

1. All tokens of the same type are pooled together
2. Pool tracks: total quantity + total allowable cost (pooled cost)
3. On disposal: cost basis = (pooled cost / pool quantity) × amount sold
4. On acquisition: add to pool quantity and pooled cost
5. **Same-day rule**: If buy and sell on same day, match those first
6. **Bed & Breakfast rule (30-day)**: If you sell and rebuy within 30 days, match with the rebuy

**Implementation pattern (follow PMPA style):**

```typescript
export function calculateUKSharePooling(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  // 1. Filter applicable lots
  // 2. Calculate pooled cost basis = sum(costBasisUsd) / sum(amount) for all lots of same asset
  // 3. Consume lots in FIFO order (for tracking), but use pooled average cost per unit
  // 4. Holding period = LONG_TERM if earliest lot > 1 year (simplified)
}
```

Note: The simplified version uses the Section 104 pool average (same as PMPA for basic cases). Same-day and B&B rules are noted in comments but not enforced in v1 — this matches the "Global Tax Engine" positioning without over-engineering.

**Tests (12+ cases):**

1. Single lot → pool cost = lot cost
2. Multiple lots → weighted average pool cost
3. Partial sale → proportional pool cost
4. Multiple sales → pool cost decreases correctly
5. Zero lot → returns zero gain
6. Fee handling
7. Strict silo mode
8. Long-term vs short-term holding period
9. Mixed assets (BTC + ETH) — pool per asset
10. Small remainder precision
11. Full liquidation
12. Multiple acquisitions then multiple disposals

---

## Task 4: Register UK Share Pooling in Calculator + Update Frontend

**Files:**

- Modify: `packages/tax-engine/src/calculator.ts:74-99` (add case)
- Modify: `packages/tax-engine/src/index.ts` (add export)
- Modify: `apps/web/src/app/[locale]/settings/page.tsx` (add to METHODS array)
- Modify: `apps/web/src/app/[locale]/tax/page.tsx` (add to method selector if hardcoded)
- Modify: `apps/web/messages/{en,zh,zh-Hant,es,ja,ko,pt}.json` (add method label)
- Modify: `apps/api/src/routes/tax.ts` (add to method enum if hardcoded)

**i18n key (settings/tax):**

```json
"ukSharePooling": "UK Share Pooling (Section 104)"
```

---

## Task 5: Add CRS 2.0 / CARF Transaction Data Export Endpoint

**Files:**

- Modify: `apps/api/src/routes/transactions.ts` (add GET /transactions/export-carf)
- Modify: `apps/api/src/__tests__/routes.test.ts` (add tests)

**Endpoint: GET /transactions/export-carf**

- Auth: JWT required
- Plan gate: PRO/CPA only (checkFeatureAccess)
- Query: `{ year: number }`
- Returns: CSV with CARF-format columns

**CARF Report Columns:**

```
TransactionDate,TransactionType,Asset,Amount,CounterAsset,CounterAmount,FiatValue,Exchange,WalletAddress,TransactionHash
```

**TransactionType mapping:**

- BUY/SELL → "Crypto-Fiat Exchange"
- TRADE → "Crypto-Crypto Exchange"
- TRANSFER_IN/OUT → "Transfer"
- STAKING_REWARD/MINING/AIRDROP → "Income"
- DEX_SWAP → "DeFi Exchange"

---

## Execution Order

1. Task 3 — UK Share Pooling engine (backend, tests)
2. Task 4 — Register method + frontend integration
3. Task 1 — CARF countdown on tax page
4. Task 2 — CARF dates on global-tax-rates
5. Task 5 — CARF export endpoint

## Five-Step Audit (after all tasks)

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/web exec tsc --noEmit
pnpm --filter @dtax/api test
node -e "for(const l of ['en','zh','zh-Hant','es','ja','ko','pt']){JSON.parse(require('fs').readFileSync('apps/web/messages/'+l+'.json','utf8'));console.log(l+' OK')}"
pnpm --filter @dtax/web build
```
