# Component Library Extraction Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从 43 个页面文件中抽取 9 个可复用 React 组件，同时将所有 emoji 图标替换为 Lucide React SVG 图标，遵循 UI UX Pro Max 的 Fintech/Crypto 设计规范。

**Architecture:** 在 `apps/web/src/components/ui/` 下创建组件库，每个组件一个文件。组件使用已有 CSS classes（globals.css），不引入新的样式系统。逐页替换现有重复代码为组件调用。每个 Task 完成后执行五步法审计。

**Tech Stack:** React, TypeScript, Next.js 14, lucide-react, CSS (globals.css design tokens)

---

## UI UX Pro Max 设计规范（所有 Task 通用）

参考 [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) Fintech/Crypto 规则：

**必须遵守：**

- **禁止 emoji 图标** — 全部替换为 Lucide React SVG 图标
- **cursor-pointer** 所有可点击元素
- **hover 过渡** 150-300ms（已有 `.card-hover`、`.stat-card:hover`）
- **focus 可见** — 交互元素需要 focus ring
- **prefers-reduced-motion** — 动画尊重用户偏好
- **触摸目标** 最小 44x44px
- **正文最小** 16px（var(--text-base)）
- **对比度** 4.5:1 minimum

**禁止：**

- AI 紫/粉渐变（`.gradient-text` 仅用于 hero 标题）
- Playful / 卡通风格设计
- emoji 作为功能图标

**Lucide 图标映射表：**

| Emoji | Lucide 组件              | 用途      |
| ----- | ------------------------ | --------- |
| 🧮    | `Calculator`             | 计算/加载 |
| 📊    | `BarChart3`              | 图表/数据 |
| ⚠️/⚠  | `AlertTriangle`          | 警告      |
| ⏳    | `Loader2` (animate-spin) | 计算中    |
| 📭    | `Inbox`                  | 空数据    |
| 🚀    | `Rocket`                 | 功能亮点  |
| 🔐    | `Lock`                   | 安全      |
| ✅    | `CheckCircle`            | 完成/成功 |
| 🔄    | `RefreshCw`              | 刷新/更新 |
| ✕     | `X`                      | 关闭      |

---

### Task 1: 安装 lucide-react + 创建组件目录

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/ui/index.ts`

**Step 1: 安装 lucide-react**

```bash
cd apps/web && pnpm add lucide-react
```

**Step 2: 创建组件目录和 barrel export**

```bash
mkdir -p apps/web/src/components/ui
```

```typescript
// apps/web/src/components/ui/index.ts
export { StatCard } from "./stat-card";
export type { StatCardProps } from "./stat-card";
export { PageHeader } from "./page-header";
export type { PageHeaderProps } from "./page-header";
export { AlertBanner } from "./alert-banner";
export type { AlertBannerProps } from "./alert-banner";
export { EmptyState } from "./empty-state";
export type { EmptyStateProps } from "./empty-state";
export { Modal } from "./modal";
export type { ModalProps } from "./modal";
export { FormField } from "./form-field";
export type { FormFieldProps } from "./form-field";
export { DataTable } from "./data-table";
export type { DataTableProps, Column } from "./data-table";
export { Card } from "./card";
export type { CardProps } from "./card";
export { ButtonGroup } from "./button-group";
export type { ButtonGroupProps } from "./button-group";
```

注意：先创建 index.ts，各组件文件在后续 Task 逐步创建。index.ts 中的 export 会在对应组件创建后才生效，在此之前可以先注释掉或在 Task 2 开始时同步取消注释。

**Step 3: 提交**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/components/ui/
git commit -m "chore(web): install lucide-react and create component library directory"
```

**Step 4: 五步法审计**

```bash
pnpm -r exec tsc --noEmit          # 零错误
pnpm test                           # 1120+ 通过
grep -rn "sk_\|password" apps/web/src/components/  # 无密钥
pnpm build                          # 5/5
```

---

### Task 2: StatCard 组件

**Files:**

- Create: `apps/web/src/components/ui/stat-card.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx` (dashboard, 5 cards)
- Modify: `apps/web/src/app/[locale]/portfolio/page.tsx` (5 cards)
- Modify: `apps/web/src/app/[locale]/tax/page.tsx` (5+ cards)
- Modify: `apps/web/src/app/[locale]/admin/page.tsx` (6 cards)
- Modify: `apps/web/src/app/[locale]/reconcile/page.tsx` (6 cards)
- Modify: `apps/web/src/app/[locale]/transfers/page.tsx` (3 cards)

**Step 1: 创建 StatCard 组件**

```tsx
// apps/web/src/components/ui/stat-card.tsx
"use client";

import type { ReactNode, CSSProperties } from "react";

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Color variant for the value text */
  color?:
    | "positive"
    | "negative"
    | "neutral"
    | "accent"
    | "warn"
    | "gain"
    | "loss";
  /** Custom color string (CSS variable or hex), overrides color prop */
  customColor?: string;
  /** Show colored left border */
  borderLeft?: "accent" | "green" | "red" | string;
  /** Extra content below the value (e.g., income breakdown) */
  children?: ReactNode;
  /** Additional className on the container */
  className?: string;
}

const colorClassMap: Record<string, string> = {
  positive: "positive",
  negative: "negative",
  neutral: "neutral",
  accent: "text-accent",
  warn: "text-warn",
  gain: "text-gain",
  loss: "text-loss",
};

const borderClassMap: Record<string, string> = {
  accent: "border-l-accent",
  green: "border-l-green",
  red: "border-l-red",
};

export function StatCard({
  label,
  value,
  color = "neutral",
  customColor,
  borderLeft,
  children,
  className,
}: StatCardProps) {
  const borderCls = borderLeft ? borderClassMap[borderLeft] || "" : "";

  const borderStyle: CSSProperties | undefined =
    borderLeft && !borderClassMap[borderLeft]
      ? { borderLeft: `3px solid ${borderLeft}`, borderColor: borderLeft }
      : undefined;

  const valueCls = customColor
    ? "stat-value"
    : `stat-value ${colorClassMap[color] || "neutral"}`;

  const valueStyle: CSSProperties | undefined = customColor
    ? { color: customColor }
    : undefined;

  return (
    <div
      className={`stat-card ${borderCls} ${className || ""}`.trim()}
      style={borderStyle}
    >
      <span className="stat-label">{label}</span>
      <span className={valueCls} style={valueStyle}>
        {value}
      </span>
      {children}
    </div>
  );
}
```

**Step 2: 替换 Dashboard page.tsx 中的 stat cards**

Before:

```jsx
<div className="stat-card">
  <span className="stat-label">{t("netGainLoss")}</span>
  <span
    className={`stat-value ${taxSummary && taxSummary.netGainLoss >= 0 ? "positive" : "negative"}`}
  >
    {taxSummary ? formatFiat(taxSummary.netGainLoss) : "—"}
  </span>
</div>
```

After:

```jsx
<StatCard
  label={t("netGainLoss")}
  value={taxSummary ? formatFiat(taxSummary.netGainLoss) : "—"}
  color={taxSummary && taxSummary.netGainLoss >= 0 ? "positive" : "negative"}
/>
```

对 ordinaryIncome 特殊卡（带 border-left + children）：

```jsx
<StatCard
  label={t("ordinaryIncome")}
  value={formatFiat(taxSummary.income?.total ?? taxSummary.totalIncome ?? 0)}
  color="accent"
  borderLeft="accent"
>
  {taxSummary.income && (
    <div className="text-muted mt-1 leading-relaxed text-2xs">
      {/* income breakdown lines */}
    </div>
  )}
</StatCard>
```

**Step 3: 替换其他 5 个文件中的 stat cards**

- `portfolio/page.tsx`: 4 基础卡 + 1 TLH 特殊卡（borderLeft red）
- `tax/page.tsx`: 3 基础卡 + 2 条件卡（income, washSale）
- `admin/page.tsx`: 6 卡 — 注意 admin 当前用 `.card` 不是 `.stat-card`，统一改为 `<StatCard>`
- `reconcile/page.tsx`: 6 卡，部分有 customColor（purple、conditional netDiff）
- `transfers/page.tsx`: 3 基础卡

**Step 4: 提交**

```bash
git add apps/web/src/components/ui/stat-card.tsx apps/web/src/app/[locale]/page.tsx \
  apps/web/src/app/[locale]/portfolio/page.tsx apps/web/src/app/[locale]/tax/page.tsx \
  apps/web/src/app/[locale]/admin/page.tsx apps/web/src/app/[locale]/reconcile/page.tsx \
  apps/web/src/app/[locale]/transfers/page.tsx apps/web/src/components/ui/index.ts
git commit -m "feat(web): extract StatCard component and replace 30+ instances across 6 pages"
```

**Step 5: 五步法审计**

```bash
pnpm -r exec tsc --noEmit
pnpm test
grep -rn "sk_\|password" apps/web/src/components/ui/
pnpm build
```

---

### Task 3: PageHeader 组件

**Files:**

- Create: `apps/web/src/components/ui/page-header.tsx`
- Modify: 10 页面文件（dashboard, portfolio, tax, transactions, transfers, settings, compare, simulator, reconcile, admin/users）

**Step 1: 创建 PageHeader 组件**

```tsx
// apps/web/src/components/ui/page-header.tsx
import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Action buttons/controls rendered on the right side */
  actions?: ReactNode;
  /** Additional className */
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={`page-header ${className || ""}`.trim()}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex gap-2 items-center flex-wrap">{actions}</div>
      )}
    </div>
  );
}
```

**Step 2: 替换所有页面的 header 模式**

Before:

```jsx
<div className="page-header">
  <div>
    <h1 className="page-title">{t("title")}</h1>
    <p className="page-subtitle">{t("subtitle")}</p>
  </div>
  <div className="flex gap-2">
    <button className="btn btn-primary">{action}</button>
  </div>
</div>
```

After:

```jsx
<PageHeader
  title={t("title")}
  subtitle={t("subtitle")}
  actions={<button className="btn btn-primary">{action}</button>}
/>
```

对所有 10 个文件逐一替换。注意部分页面的 subtitle 包含插值参数（如 dashboard 的 `t("subtitle", { year, method })`）。

**Step 3: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract PageHeader component and replace 10+ instances"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 4: AlertBanner 组件

**Files:**

- Create: `apps/web/src/components/ui/alert-banner.tsx`
- Modify: ~8 页面文件（settings, portfolio, tax, transactions, transfers, reconcile, simulator, ai-assistant）

**Step 1: 创建 AlertBanner 组件**

```tsx
// apps/web/src/components/ui/alert-banner.tsx
"use client";

import { AlertTriangle, CheckCircle, Info, XCircle, X } from "lucide-react";
import type { ReactNode } from "react";

export interface AlertBannerProps {
  type: "success" | "error" | "warning" | "info";
  /** Main message text or ReactNode */
  children: ReactNode;
  /** Show dismiss button */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
}

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const classMap = {
  success: "alert-success",
  error: "alert-error",
  warning: "alert-warning",
  info: "alert-info",
};

export function AlertBanner({
  type,
  children,
  onDismiss,
  className,
}: AlertBannerProps) {
  const Icon = iconMap[type];

  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-sm text-base ${classMap[type]} ${className || ""}`.trim()}
    >
      <Icon size={18} style={{ flexShrink: 0 }} />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="cursor-pointer bg-transparent border-none p-1"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
```

**Step 2: 替换所有页面的 alert/banner 模式**

Before (success):

```jsx
<div className="mt-3 p-3 text-center text-base rounded-sm alert-success">
  {message}
</div>
```

After:

```jsx
<AlertBanner type="success" className="mt-3 text-center">
  {message}
</AlertBanner>
```

Before (error with dismiss):

```jsx
<div className="card backfill-msg mb-3 text-base flex-between">
  <span>{msg}</span>
  <button className="dismiss-btn-plain" onClick={() => setMsg(null)}>
    ✕
  </button>
</div>
```

After:

```jsx
<AlertBanner type="info" onDismiss={() => setMsg(null)} className="mb-3">
  {msg}
</AlertBanner>
```

Before (warning with ⚠):

```jsx
<span className="text-warn">⚠</span>
```

After: 组件内自动使用 `<AlertTriangle />` Lucide 图标。

替换所有 `⚠️`/`⚠` emoji 为 AlertBanner 组件或直接使用 `<AlertTriangle />` 图标。

**Step 3: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract AlertBanner component, replace emoji warnings with Lucide icons"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 5: EmptyState 组件（loading + empty + error）

**Files:**

- Create: `apps/web/src/components/ui/empty-state.tsx`
- Modify: ~12 页面文件

**Step 1: 创建 EmptyState 组件**

```tsx
// apps/web/src/components/ui/empty-state.tsx
"use client";

import { Loader2, Inbox, AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Preset variant or custom */
  variant?: "loading" | "empty" | "error";
  /** Custom Lucide icon (overrides variant default) */
  icon?: LucideIcon;
  /** Main message */
  title?: string;
  /** Secondary hint text */
  hint?: string;
  /** Error message (for error variant) */
  error?: string;
  /** Action button or link */
  action?: ReactNode;
  /** Wrap in card */
  card?: boolean;
  /** Additional className */
  className?: string;
}

const variantDefaults = {
  loading: { icon: Loader2, spin: true },
  empty: { icon: Inbox, spin: false },
  error: { icon: AlertTriangle, spin: false },
};

export function EmptyState({
  variant = "empty",
  icon: CustomIcon,
  title,
  hint,
  error,
  action,
  card = true,
  className,
}: EmptyStateProps) {
  const defaults = variantDefaults[variant];
  const Icon = CustomIcon || defaults.icon;
  const shouldSpin = !CustomIcon && defaults.spin;

  const content = (
    <>
      <div className="mb-4">
        <Icon
          size={48}
          className={`text-muted mx-auto ${shouldSpin ? "animate-spin" : ""}`}
        />
      </div>
      {title && <p className="text-muted text-base">{title}</p>}
      {error && <p className="text-loss text-base">{error}</p>}
      {hint && <p className="text-muted text-sm mt-2">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </>
  );

  if (card) {
    return (
      <div className={`card text-center py-12 px-6 ${className || ""}`.trim()}>
        {content}
      </div>
    );
  }

  return (
    <div className={`text-center py-12 px-6 ${className || ""}`.trim()}>
      {content}
    </div>
  );
}
```

**Step 2: 替换所有 loading/empty/error 状态**

Before (loading with emoji):

```jsx
<div className="text-center py-15">
  <div className="loading-pulse text-icon-xl">🧮</div>
  <p className="text-muted mt-4">{tc("loading")}</p>
</div>
```

After:

```jsx
<EmptyState variant="loading" title={tc("loading")} card={false} />
```

Before (empty with emoji):

```jsx
<div className="card text-center card-py-12">
  <div className="mb-4 text-icon-xl">📭</div>
  <p className="text-muted">{t("noPositions")}</p>
  <p className="text-muted text-sm mt-2">{t("noPositionsHint")}</p>
</div>
```

After:

```jsx
<EmptyState title={t("noPositions")} hint={t("noPositionsHint")} />
```

Before (error with emoji):

```jsx
<div className="text-center py-15">
  <div className="mb-4 text-icon-xl">⚠️</div>
  <p className="text-loss">{error}</p>
  <button className="btn btn-primary mt-4" onClick={loadData}>
    {tc("retry")}
  </button>
</div>
```

After:

```jsx
<EmptyState
  variant="error"
  error={error}
  action={
    <button className="btn btn-primary" onClick={loadData}>
      {tc("retry")}
    </button>
  }
  card={false}
/>
```

替换所有文件中的 emoji 图标（🧮、📊、📭、⚠️）为 EmptyState 组件。

**Step 3: 替换非 EmptyState 场景的 emoji**

剩余 emoji 在 `faq/page.tsx`、`security/page.tsx`、`docs/page.tsx` 中用作 feature/section 图标。这些不属于 EmptyState 模式，直接替换为 Lucide 图标：

```tsx
// faq/page.tsx data 数组
import { Rocket, Calculator } from "lucide-react";
// icon: "🚀" → icon: Rocket
// icon: "🧮" → icon: Calculator

// security/page.tsx
import { Lock, CheckCircle } from "lucide-react";
// icon: "🔐" → icon: Lock
// icon: "✅" → icon: CheckCircle

// docs/page.tsx
import { RefreshCw } from "lucide-react";
// icon: "🔄" → icon: RefreshCw
```

同时替换 dashboard 计算按钮中的 emoji：

```tsx
// page.tsx (dashboard)
import { Loader2, Calculator } from "lucide-react";
// ⏳ ${t("calculating")} → <Loader2 size={16} className="animate-spin inline" /> {t("calculating")}
// 🧮 ${t("calculateTax")} → <Calculator size={16} className="inline" /> {t("calculateTax")}
```

和 `tax/page.tsx` 中的类似模式。

**Step 4: 全局搜索确认无残留 emoji**

```bash
grep -rn "🧮\|📊\|⚠️\|⏳\|📭\|🚀\|🔐\|✅\|🔄\|⚠" apps/web/src/ --include="*.tsx" | grep -v node_modules
```

Expected: 零匹配（或仅 alt text/注释中的）

**Step 5: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract EmptyState component, replace all emoji icons with Lucide SVGs"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 6: Modal 组件

**Files:**

- Create: `apps/web/src/components/ui/modal.tsx`
- Modify: `apps/web/src/components/upgrade-modal.tsx`
- Modify: 需要 modal 的页面（如有 confirm dialog 的页面）

**Step 1: 创建 Modal 组件**

```tsx
// apps/web/src/components/ui/modal.tsx
"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Footer actions */
  actions?: ReactNode;
  /** Additional className for dialog */
  className?: string;
  /** Close button aria-label */
  closeLabel?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  className,
  closeLabel = "Close",
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-dialog relative ${className || ""}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute cursor-pointer bg-transparent border-none text-muted p-1 leading-none modal-close"
        >
          <X size={20} />
        </button>
        {title && (
          <h2 className="text-2xl font-bold text-primary mb-2">{title}</h2>
        )}
        {subtitle && (
          <p className="text-base text-secondary mb-5">{subtitle}</p>
        )}
        <div>{children}</div>
        {actions && <div className="mt-5">{actions}</div>}
      </div>
    </div>
  );
}
```

**Step 2: 重构 upgrade-modal.tsx 使用 Modal 组件**

Before: 手动编写 modal-backdrop + modal-dialog + ✕ 关闭按钮
After: 使用 `<Modal>` 包裹内容，✕ 替换为 `<X />` Lucide 图标

```tsx
// apps/web/src/components/upgrade-modal.tsx
import { Modal } from "./ui/modal";

export function UpgradeModal({ open, onClose, ... }: UpgradeModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={t("title")} subtitle={t("subtitle")} closeLabel={t("close")}>
      {/* progress bar */}
      {/* benefits text */}
      {/* upgrade button */}
      {/* view plans link */}
    </Modal>
  );
}
```

**Step 3: 搜索其他 ✕ 关闭按钮实例，替换为 `<X />` Lucide 图标**

```bash
grep -rn "✕" apps/web/src/ --include="*.tsx"
```

**Step 4: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract Modal component with Lucide X icon, refactor upgrade-modal"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 7: FormField 组件

**Files:**

- Create: `apps/web/src/components/ui/form-field.tsx`
- Modify: settings, transactions/components (TransactionForm, FilterBar, ImportPanel, ApiSyncPanel), clients, reconcile, onboarding 页面

**Step 1: 创建 FormField 组件**

```tsx
// apps/web/src/components/ui/form-field.tsx
import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";

export interface FormFieldProps {
  label: string;
  /** Input element ID for htmlFor */
  id?: string;
  /** Label variant */
  labelClass?: "form-label" | "tx-label";
  /** Render a custom child instead of input/select */
  children?: ReactNode;
  /** Additional className on the wrapper */
  className?: string;
}

export function FormField({
  label,
  id,
  labelClass = "form-label",
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={className}>
      <label className={`${labelClass} mb-1 block`} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
```

**Step 2: 替换所有 label + input/select 模式**

Before:

```jsx
<div>
  <label className="form-label mb-2">{t("method")}</label>
  <select className="input" value={method} onChange={handleChange}>
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
</div>
```

After:

```jsx
<FormField label={t("method")} id="method-select">
  <select
    id="method-select"
    className="input"
    value={method}
    onChange={handleChange}
  >
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
</FormField>
```

Before (tx- variant):

```jsx
<div>
  <label className="tx-label">{t("form.type")}</label>
  <select className="tx-input" value={form.type} onChange={...}>{...}</select>
</div>
```

After:

```jsx
<FormField label={t("form.type")} labelClass="tx-label">
  <select className="tx-input" value={form.type} onChange={...}>{...}</select>
</FormField>
```

替换涉及文件：settings, TransactionForm, FilterBar, ImportPanel, ApiSyncPanel, clients, reconcile, compare, simulator, onboarding。

**Step 3: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract FormField component and replace 30+ label+input patterns"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 8: DataTable 组件

**Files:**

- Create: `apps/web/src/components/ui/data-table.tsx`
- Modify: tax/page.tsx (breakdown table, Schedule D tables), compare/page.tsx, admin/users/page.tsx

**Step 1: 创建 DataTable 组件**

```tsx
// apps/web/src/components/ui/data-table.tsx
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  /** Render custom cell content */
  render?: (row: T, index: number) => ReactNode;
  /** Additional className for th/td */
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Row key extractor */
  rowKey: (row: T, index: number) => string | number;
  /** Summary/total row at bottom */
  footer?: ReactNode;
  /** Highlight row condition */
  rowClassName?: (row: T, index: number) => string;
  /** Additional className on wrapper */
  className?: string;
  /** Remove outer border */
  borderless?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  footer,
  rowClassName,
  className,
  borderless,
}: DataTableProps<T>) {
  return (
    <div
      className={`table-container ${borderless ? "border-none" : ""} ${className || ""}`.trim()}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${col.className || ""}`.trim()}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={rowKey(row, i)} className={rowClassName?.(row, i) || ""}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""} ${col.className || ""}`.trim()}
                >
                  {col.render
                    ? col.render(row, i)
                    : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
```

**Step 2: 替换 tax/page.tsx 中的 breakdown 表格和 Schedule D 表格**

将手写的 `<table><thead><tr><th>...` 模式替换为 `<DataTable columns={[...]} data={[...]} />` 声明式写法。

**Step 3: 替换 compare/page.tsx 中的年度对比表格**

**Step 4: 注意 — 不替换 TransactionTable.tsx**

TransactionTable 有排序、编辑模式、checkbox 选择、批量操作等复杂交互，不适合用通用 DataTable 替换。保持原样。admin/users 也有展开行等复杂逻辑，仅替换简单表格。

**Step 5: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract DataTable component for declarative table rendering"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 9: Card 组件

**Files:**

- Create: `apps/web/src/components/ui/card.tsx`
- Modify: 多个页面中重复的 card 模式（带标题 + 内容的 card）

**Step 1: 创建 Card 组件**

```tsx
// apps/web/src/components/ui/card.tsx
import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  /** Title size variant */
  titleSize?: "sm" | "md" | "lg";
  children: ReactNode;
  /** Additional className */
  className?: string;
  /** Card padding override */
  padding?: string;
}

const titleSizeMap = {
  sm: "text-base font-semibold mb-3",
  md: "text-lg font-semibold mb-5",
  lg: "text-xl font-semibold mb-5",
};

export function Card({
  title,
  titleSize = "md",
  children,
  className,
  padding,
}: CardProps) {
  return (
    <div className={`card ${padding || ""} ${className || ""}`.trim()}>
      {title && <h3 className={titleSizeMap[titleSize]}>{title}</h3>}
      {children}
    </div>
  );
}
```

**Step 2: 替换重复的 card + 标题模式**

Before:

```jsx
<div className="card">
  <h3 className="text-lg font-semibold mb-5">{t("breakdown")}</h3>
  {/* content */}
</div>
```

After:

```jsx
<Card title={t("breakdown")}>{/* content */}</Card>
```

主要替换 tax/page.tsx、settings/page.tsx、portfolio/page.tsx 等带标题的 card sections。对于没有标题的简单 card，保持原有 `className="card"` 不变（避免过度抽象）。

**Step 3: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract Card component for titled card sections"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 10: ButtonGroup 组件

**Files:**

- Create: `apps/web/src/components/ui/button-group.tsx`
- Modify: transactions/page.tsx, settings/page.tsx, tax/page.tsx, 其他有按钮组的页面

**Step 1: 创建 ButtonGroup 组件**

```tsx
// apps/web/src/components/ui/button-group.tsx
import type { ReactNode } from "react";

export interface ButtonGroupProps {
  children: ReactNode;
  /** Layout variant */
  align?: "start" | "end" | "center" | "between";
  /** Gap size */
  gap?: 1 | 2 | 3 | 4;
  /** Allow wrapping */
  wrap?: boolean;
  /** Additional className */
  className?: string;
}

const alignMap = {
  start: "justify-start",
  end: "justify-end",
  center: "justify-center",
  between: "flex-between",
};

export function ButtonGroup({
  children,
  align = "start",
  gap = 2,
  wrap = false,
  className,
}: ButtonGroupProps) {
  const alignCls =
    align === "between" ? "flex-between" : `flex ${alignMap[align]}`;

  return (
    <div
      className={`${alignCls} items-center gap-${gap} ${wrap ? "flex-wrap" : ""} ${className || ""}`.trim()}
    >
      {children}
    </div>
  );
}
```

**Step 2: 替换明显的按钮组模式**

仅替换结构重复最多的模式（如 page header 中的 action 按钮组、表单提交区）。简单的 `flex gap-2` 不强制替换。

Before:

```jsx
<div className="flex gap-2 items-center flex-wrap">
  <button className="btn btn-secondary">{t("export")}</button>
  <button className="btn btn-primary">{t("add")}</button>
</div>
```

After:

```jsx
<ButtonGroup gap={2} wrap>
  <button className="btn btn-secondary">{t("export")}</button>
  <button className="btn btn-primary">{t("add")}</button>
</ButtonGroup>
```

**Step 3: 提交 + 五步法审计**

```bash
git commit -m "feat(web): extract ButtonGroup component for consistent button layouts"
pnpm -r exec tsc --noEmit && pnpm test && pnpm build
```

---

### Task 11: 更新 barrel export + 最终审计

**Files:**

- Modify: `apps/web/src/components/ui/index.ts` — 确保所有 9 个组件正确导出
- 全局搜索确认

**Step 1: 确认 index.ts barrel export 完整**

确认所有 9 个组件文件存在且正确导出：

- stat-card.tsx
- page-header.tsx
- alert-banner.tsx
- empty-state.tsx
- modal.tsx
- form-field.tsx
- data-table.tsx
- card.tsx
- button-group.tsx

**Step 2: 全局搜索残留 emoji**

```bash
grep -rn "🧮\|📊\|⚠️\|⏳\|📭\|🚀\|🔐\|✅\|🔄" apps/web/src/ --include="*.tsx"
```

Expected: 零匹配

**Step 3: 确认组件使用情况**

```bash
grep -rc "from.*components/ui" apps/web/src/app/ --include="*.tsx" | grep -v ":0$" | sort -t: -k2 -rn
```

Expected: 至少 15+ 个文件引用组件库

**Step 4: 提交 + 最终五步法审计**

```bash
git commit -m "chore(web): finalize component library barrel exports and cleanup"
pnpm -r exec tsc --noEmit     # 零错误
pnpm test                      # 1120+ 通过
grep -rn "sk_\|password" apps/web/src/components/ui/  # 无密钥
pnpm build                     # 5/5
```

---

### 预期成果

| 指标                         | Before            | After                          |
| ---------------------------- | ----------------- | ------------------------------ |
| 可复用组件                   | 1 (upgrade-modal) | 10 (9 新 + 1 重构)             |
| Emoji 图标                   | 17                | 0                              |
| Lucide SVG 图标              | 0                 | 10+                            |
| stat-card 重复代码           | 25+ 手写          | 0（全部 `<StatCard>` 调用）    |
| page-header 重复代码         | 10+ 手写          | 0（全部 `<PageHeader>` 调用）  |
| alert/banner 重复代码        | 15+ 手写          | 0（全部 `<AlertBanner>` 调用） |
| loading/empty/error 重复代码 | 20+ 手写          | 0（全部 `<EmptyState>` 调用）  |
| modal 实例                   | 1 手写            | 1 `<Modal>` 组件化             |
| 总消除行数                   | ~800+             | —                              |
| 新增组件代码                 | —                 | ~400 行                        |
