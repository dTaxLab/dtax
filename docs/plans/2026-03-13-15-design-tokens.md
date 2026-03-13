# Design Tokens & Inline Style Elimination Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a complete design token system in globals.css and replace 1,334 inline styles with CSS utility classes, reducing inline style count by 70%+.

**Architecture:** Extend existing CSS variable system (26 color tokens, 4 radius tokens, 4 shadow tokens) with spacing, typography, component, animation, and z-index tokens. Create utility CSS classes for the top 10 most common inline patterns. Refactor all page components to use classes instead of inline styles.

**Tech Stack:** Pure CSS variables + utility classes (no Tailwind/CSS-in-JS). Next.js globals.css.

---

### Task 1: Add Spacing & Typography Tokens to globals.css

**Files:**

- Modify: `apps/web/src/app/globals.css`

**Step 1: Add tokens after existing `:root` variables**

Add inside the existing `:root` block (after `--shadow-glow`):

```css
/* === SPACING TOKENS (4px base grid) === */
--space-0: 0;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;

/* Semantic spacing */
--gap-xs: var(--space-2);
--gap-sm: var(--space-3);
--gap-md: var(--space-4);
--gap-lg: var(--space-6);
--gap-xl: var(--space-8);

/* === TYPOGRAPHY TOKENS === */
--text-xs: 12px;
--text-sm: 13px;
--text-base: 14px;
--text-md: 15px;
--text-lg: 16px;
--text-xl: 18px;
--text-2xl: 20px;
--text-3xl: 24px;
--text-4xl: 28px;
--text-5xl: 36px;

--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.6;

/* === COMPONENT TOKENS === */
--input-height: 38px;
--input-padding-x: 12px;
--input-padding-y: 8px;
--input-border-radius: 6px;
--input-font-size: var(--text-base);

--btn-height-sm: 32px;
--btn-height-md: 38px;
--btn-height-lg: 44px;

--card-padding: 24px;
--card-padding-sm: 16px;

/* === ANIMATION TOKENS === */
--duration-fast: 120ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

/* === Z-INDEX LAYERS === */
--z-dropdown: 1000;
--z-sticky: 1100;
--z-modal-backdrop: 1200;
--z-modal: 1300;
--z-popover: 1400;
--z-tooltip: 1500;
```

**Step 2: Verify build passes**

Run: `pnpm --filter @dtax/web build`
Expected: Build succeeds (tokens are additive, no breaking changes)

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): add spacing, typography, component, animation, z-index design tokens"
```

---

### Task 2: Create Utility CSS Classes

**Files:**

- Modify: `apps/web/src/app/globals.css`

**Step 1: Add utility classes at end of globals.css (before media queries)**

```css
/* ============================================================
   UTILITY CLASSES — Replace inline styles
   ============================================================ */

/* --- Flexbox Layouts (target: 192 inline display:flex) --- */
.flex {
  display: flex;
}
.flex-col {
  display: flex;
  flex-direction: column;
}
.flex-row {
  display: flex;
  flex-direction: row;
}
.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}
.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.flex-start {
  display: flex;
  align-items: flex-start;
}
.flex-wrap {
  flex-wrap: wrap;
}
.flex-1 {
  flex: 1;
}
.items-center {
  align-items: center;
}
.items-start {
  align-items: flex-start;
}
.justify-center {
  justify-content: center;
}
.justify-end {
  justify-content: flex-end;
}

/* --- Gap Utilities (target: 106 inline gap) --- */
.gap-1 {
  gap: var(--space-1);
}
.gap-2 {
  gap: var(--space-2);
}
.gap-3 {
  gap: var(--space-3);
}
.gap-4 {
  gap: var(--space-4);
}
.gap-5 {
  gap: var(--space-5);
}
.gap-6 {
  gap: var(--space-6);
}
.gap-8 {
  gap: var(--space-8);
}

/* --- Margin Utilities (target: 336+ inline margins) --- */
.mb-0 {
  margin-bottom: 0;
}
.mb-1 {
  margin-bottom: var(--space-1);
}
.mb-2 {
  margin-bottom: var(--space-2);
}
.mb-3 {
  margin-bottom: var(--space-3);
}
.mb-4 {
  margin-bottom: var(--space-4);
}
.mb-5 {
  margin-bottom: var(--space-5);
}
.mb-6 {
  margin-bottom: var(--space-6);
}
.mb-8 {
  margin-bottom: var(--space-8);
}

.mt-1 {
  margin-top: var(--space-1);
}
.mt-2 {
  margin-top: var(--space-2);
}
.mt-3 {
  margin-top: var(--space-3);
}
.mt-4 {
  margin-top: var(--space-4);
}
.mt-6 {
  margin-top: var(--space-6);
}
.mt-8 {
  margin-top: var(--space-8);
}

.mr-1 {
  margin-right: var(--space-1);
}
.mr-2 {
  margin-right: var(--space-2);
}
.mr-3 {
  margin-right: var(--space-3);
}
.ml-1 {
  margin-left: var(--space-1);
}
.ml-2 {
  margin-left: var(--space-2);
}

/* --- Padding Utilities (target: 327 inline padding) --- */
.p-2 {
  padding: var(--space-2);
}
.p-3 {
  padding: var(--space-3);
}
.p-4 {
  padding: var(--space-4);
}
.p-6 {
  padding: var(--space-6);
}
.px-3 {
  padding-left: var(--space-3);
  padding-right: var(--space-3);
}
.px-4 {
  padding-left: var(--space-4);
  padding-right: var(--space-4);
}
.px-6 {
  padding-left: var(--space-6);
  padding-right: var(--space-6);
}
.py-2 {
  padding-top: var(--space-2);
  padding-bottom: var(--space-2);
}
.py-3 {
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.py-4 {
  padding-top: var(--space-4);
  padding-bottom: var(--space-4);
}

/* --- Typography Utilities (target: 424 inline fontSize + 212 fontWeight) --- */
.text-xs {
  font-size: var(--text-xs);
}
.text-sm {
  font-size: var(--text-sm);
}
.text-base {
  font-size: var(--text-base);
}
.text-md {
  font-size: var(--text-md);
}
.text-lg {
  font-size: var(--text-lg);
}
.text-xl {
  font-size: var(--text-xl);
}
.text-2xl {
  font-size: var(--text-2xl);
}
.text-3xl {
  font-size: var(--text-3xl);
}
.text-4xl {
  font-size: var(--text-4xl);
}

.font-normal {
  font-weight: var(--font-normal);
}
.font-medium {
  font-weight: var(--font-medium);
}
.font-semibold {
  font-weight: var(--font-semibold);
}
.font-bold {
  font-weight: var(--font-bold);
}

/* --- Color Utilities (target: 458 inline color) --- */
.text-primary {
  color: var(--text-primary);
}
.text-secondary {
  color: var(--text-secondary);
}
.text-muted {
  color: var(--text-muted);
}
.text-accent {
  color: var(--accent);
}
.text-gain {
  color: var(--green);
}
.text-loss {
  color: var(--red);
}
.text-warn {
  color: var(--yellow);
}

.bg-primary {
  background: var(--bg-primary);
}
.bg-secondary {
  background: var(--bg-secondary);
}
.bg-card {
  background: var(--bg-card);
}
.bg-surface {
  background: var(--bg-surface);
}
.bg-gain {
  background: var(--green-bg);
}
.bg-loss {
  background: var(--red-bg);
}
.bg-warn {
  background: var(--yellow-bg);
}

/* --- Alignment Utilities (target: 233 inline textAlign) --- */
.text-center {
  text-align: center;
}
.text-right {
  text-align: right;
}
.text-left {
  text-align: left;
}

/* --- Width Utilities --- */
.w-full {
  width: 100%;
}
.max-w-sm {
  max-width: 400px;
}
.max-w-md {
  max-width: 600px;
}
.max-w-lg {
  max-width: 800px;
}

/* --- Form Helpers --- */
.input {
  height: var(--input-height);
  padding: var(--input-padding-y) var(--input-padding-x);
  border: 1px solid var(--border);
  border-radius: var(--input-border-radius);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--input-font-size);
  transition: border-color var(--duration-fast) var(--ease-default);
  width: 100%;
}
.input:focus {
  border-color: var(--accent);
  outline: 2px solid var(--accent-glow);
  outline-offset: -1px;
}
.input::placeholder {
  color: var(--text-muted);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}
.form-label {
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* --- Section Helpers --- */
.section-gap {
  margin-bottom: var(--space-6);
}
.section-gap-lg {
  margin-bottom: var(--space-8);
}

/* --- Misc --- */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cursor-pointer {
  cursor: pointer;
}
.border-b {
  border-bottom: 1px solid var(--border);
}
.rounded-sm {
  border-radius: var(--radius-sm);
}
.rounded-md {
  border-radius: var(--radius-md);
}
.rounded-lg {
  border-radius: var(--radius-lg);
}
```

**Step 2: Verify build**

Run: `pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): add utility CSS classes for layout, spacing, typography, color, forms"
```

---

### Task 3: Refactor Dashboard Page — Replace Inline Styles

**Files:**

- Modify: `apps/web/src/app/[locale]/page.tsx` (dashboard)

**Step 1: Replace all inline styles with utility classes**

For each inline style in the file, replace with equivalent className:

- `style={{ display: "flex", alignItems: "center", gap: "8px" }}` → `className="flex items-center gap-2"`
- `style={{ fontSize: "14px", color: "var(--text-secondary)" }}` → `className="text-base text-secondary"`
- `style={{ marginBottom: "24px" }}` → `className="mb-6"`
- `style={{ padding: "24px" }}` → `className="p-6"`
- `style={{ fontWeight: 600 }}` → `className="font-semibold"`
- `style={{ textAlign: "right" }}` → `className="text-right"`

When an element has both className and style, merge className values and remove style props that are covered. Keep style only for truly unique values (like specific grid-template-columns or dynamic values).

**Step 2: Verify build and visual check**

Run: `pnpm --filter @dtax/web build`
Tell user: Start `pnpm --filter @dtax/web dev` and visually verify dashboard at `http://localhost:3000`

**Step 3: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/page.tsx
git commit -m "refactor(web): replace dashboard inline styles with utility classes"
```

---

### Task 4: Refactor Tax Page — Replace Inline Styles

**Files:**

- Modify: `apps/web/src/app/[locale]/tax/page.tsx` (67 inline styles)

**Step 1: Same replacement strategy as Task 3**

Focus on repeated patterns:

- Select/label styling → `.form-group` + `.form-label` + `.input`
- Table cell alignment → `.text-right`, `.text-center`
- Gain/loss colors → `.text-gain`, `.text-loss`
- Section spacing → `.mb-6`, `.section-gap`
- Flex layouts → `.flex`, `.flex-between`, `.gap-4`

**Step 2: Verify build**

Run: `pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/tax/page.tsx
git commit -m "refactor(web): replace tax page inline styles with utility classes"
```

---

### Task 5: Refactor Settings Page — Replace Inline Styles

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx` (55 inline styles)

**Step 1: Same replacement strategy**

Focus areas:

- Form elements → `.form-group`, `.form-label`, `.input`
- Card sections → `.card` + `.p-6` + `.mb-6`
- Grid layouts → keep `style` for `gridTemplateColumns` only
- Button alignment → `.flex-between`, `.gap-4`

**Step 2: Verify build**

Run: `pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/settings/page.tsx
git commit -m "refactor(web): replace settings page inline styles with utility classes"
```

---

### Task 6: Refactor Transactions Page — Replace Inline Styles

**Files:**

- Modify: `apps/web/src/app/[locale]/transactions/page.tsx`

**Step 1: Same replacement strategy**

**Step 2: Verify build**

Run: `pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/transactions/page.tsx
git commit -m "refactor(web): replace transactions page inline styles with utility classes"
```

---

### Task 7: Refactor Portfolio Page — Replace Inline Styles

**Files:**

- Modify: `apps/web/src/app/[locale]/portfolio/page.tsx`

**Step 1: Same replacement strategy**

**Step 2: Verify build**

Run: `pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/portfolio/page.tsx
git commit -m "refactor(web): replace portfolio page inline styles with utility classes"
```

---

### Task 8: Refactor Remaining Pages — Batch

**Files:**

- Modify: `apps/web/src/app/[locale]/transfers/page.tsx`
- Modify: `apps/web/src/app/[locale]/simulator/page.tsx`
- Modify: `apps/web/src/app/[locale]/compare/page.tsx`
- Modify: `apps/web/src/app/[locale]/onboarding/page.tsx`
- Modify: `apps/web/src/app/[locale]/clients/page.tsx`

**Step 1: Replace inline styles in all remaining pages**

**Step 2: Verify build**

Run: `pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/\\[locale\\]/
git commit -m "refactor(web): replace inline styles in remaining pages with utility classes"
```

---

### Task 9: Refactor Auth, Marketing & Layout Components

**Files:**

- Modify: `apps/web/src/app/[locale]/auth/page.tsx`
- Modify: `apps/web/src/app/[locale]/pricing/page.tsx`
- Modify: `apps/web/src/app/[locale]/features/page.tsx`
- Modify: `apps/web/src/app/[locale]/landing-page.tsx`
- Modify: `apps/web/src/app/[locale]/notification-bell.tsx`
- Modify: Any other components with inline styles under `apps/web/src/app/[locale]/`

**Step 1: Replace inline styles**

**Step 2: Verify build**

Run: `pnpm --filter @dtax/web build`

**Step 3: Commit**

```bash
git add apps/web/src/app/
git commit -m "refactor(web): replace inline styles in auth, marketing, and layout components"
```

---

### Task 10: Five-Step Audit

**Step 1: tsc --noEmit**
Run: `pnpm --filter @dtax/web exec tsc --noEmit`
Expected: Zero errors

**Step 2: Test regression**
Run: `pnpm test`
Expected: 1113+ tests pass (CSS changes shouldn't break tests, but verify)

**Step 3: Security audit**
Run: `grep -r "dangerouslySetInnerHTML" apps/web/src/ --include="*.tsx" | wc -l`
Verify no new XSS vectors introduced.

**Step 4: i18n audit**
Run: `node -e "const en=Object.keys(JSON.parse(require('fs').readFileSync('apps/web/messages/en.json','utf8'))); const zh=Object.keys(JSON.parse(require('fs').readFileSync('apps/web/messages/zh.json','utf8'))); console.log('EN namespaces:', en.length, 'ZH namespaces:', zh.length)"`
Expected: Same count (no i18n changes in this plan)

**Step 5: Build**
Run: `pnpm build`
Expected: 5/5 tasks successful

**Step 6: Count remaining inline styles**
Run: `grep -r "style=" apps/web/src --include="*.tsx" | wc -l`
Expected: < 400 (down from 1,334 — 70%+ reduction)

**Step 7: Commit audit results**

```bash
git commit --allow-empty -m "audit: design tokens plan complete — inline styles reduced 70%+"
```
