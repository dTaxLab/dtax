# Inline Styles Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将剩余 ~634 个 inline styles 中的 ~450 个静态值转换为 CSS utility classes，将 inline style 总数降至 ~200 以下（仅保留真正的动态值）。

**Architecture:** 先在 `globals.css` 添加缺失的 utility classes，然后按文件批次转换。对于静态值使用 CSS classes，对于依赖 JS 变量/state 的动态值保留 inline style。所有更改为纯前端 CSS/JSX 重构，无逻辑变更。

**Tech Stack:** CSS, React/JSX, Next.js

---

### 转换规则（所有 Task 通用）

**必须转换的（静态值）：**

- `style={{ padding: "32px 24px" }}` → `className="p-8 px-6"` 或新 class
- `style={{ fontSize: "14px" }}` → `className="text-base"`
- `style={{ fontWeight: 700 }}` → `className="font-bold"`
- `style={{ textAlign: "center" }}` → `className="text-center"`
- `style={{ margin: "0 auto" }}` → `className="mx-auto"`
- `style={{ display: "grid", gridTemplateColumns: "..." }}` → `className="grid-auto-fill"` 或新 class
- `style={{ position: "relative" }}` → `className="relative"`
- `style={{ overflow: "hidden" }}` → `className="overflow-hidden"`
- 纯静态的 `background`、`border`、`borderRadius` → 对应 class

**保留 inline style 的（动态值）：**

- 依赖 JS 变量: `style={{ color: item.status === "active" ? "green" : "red" }}`
- 计算值: `style={{ width: \`${percentage}%\` }}`
- `clamp()` 响应式: `style={{ fontSize: "clamp(28px, 4vw, 44px)" }}`
- Spread 操作符后的覆盖值（如果 base 已转为 class）

**Style 对象模式处理：**

- 多个文件定义 `const inputStyle = { ... }` / `const selectStyle = { ... }` / `const labelStyle = { ... }`
- 这些应替换为 `.input` / `.form-label` 等已有 class，或新建 `.select-box` class
- 删除不再使用的 style 对象常量

**现有可用 utility classes（globals.css 已有）：**

- 间距: `.p-1`~`.p-8`, `.px-2`~`.px-6`, `.py-1`~`.py-8`, `.mb-0`~`.mb-8`, `.mt-0`~`.mt-8`, `.gap-0`~`.gap-10`
- 排版: `.text-xs`~`.text-5xl`, `.font-normal`~`.font-bold`, `.text-center/right/left`
- 颜色: `.text-primary/secondary/muted/accent/gain/loss/warn`, `.bg-primary/secondary/card/surface`
- 布局: `.flex`, `.flex-col`, `.flex-center`, `.flex-between`, `.grid-2/3/4`, `.items-center`
- 尺寸: `.w-full`, `.max-w-xs/sm/md/lg/xl`, `.min-w-0`
- 圆角: `.rounded-sm/md/lg`
- 定位: `.relative`, `.absolute`, `.fixed`, `.sticky`
- 表单: `.input`, `.form-group`, `.form-label`
- 边框: `.border`, `.border-t`, `.border-b`

---

### Task 1: 扩展 CSS utility classes

**Files:**

- Modify: `apps/web/src/app/globals.css`

**Step 1: 在 globals.css 末尾（`自 .self-center` 之后）添加新 utility classes**

```css
/* --- Additional utilities for inline style cleanup --- */
.mx-auto {
  margin-left: auto;
  margin-right: auto;
}
.my-0 {
  margin-top: 0;
  margin-bottom: 0;
}
.px-8 {
  padding-left: var(--space-8);
  padding-right: var(--space-8);
}
.py-5 {
  padding-top: var(--space-5);
  padding-bottom: var(--space-5);
}
.py-10 {
  padding-top: var(--space-10);
  padding-bottom: var(--space-10);
}
.py-12 {
  padding-top: var(--space-12);
  padding-bottom: var(--space-12);
}
.mt-10 {
  margin-top: var(--space-10);
}
.mt-12 {
  margin-top: var(--space-12);
}
.mb-10 {
  margin-bottom: var(--space-10);
}
.mb-12 {
  margin-bottom: var(--space-12);
}

/* Inset */
.inset-0 {
  inset: 0;
}

/* Z-index */
.z-10 {
  z-index: 10;
}
.z-50 {
  z-index: 50;
}
.z-modal {
  z-index: 9999;
}

/* Grid auto-fill/fit */
.grid-auto-fill {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--gap-md);
}
.grid-auto-fit {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--gap-md);
}

/* Select box (shared across reconcile, tax, settings, dashboard) */
.select-box {
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: var(--text-base);
  outline: none;
}
.select-box:focus {
  border-color: var(--accent);
}

/* Section padding patterns */
.section-py-lg {
  padding-top: 48px;
  padding-bottom: 48px;
}
.section-py-xl {
  padding-top: 80px;
  padding-bottom: 48px;
}

/* Hero gradient text */
.gradient-text {
  background: linear-gradient(135deg, var(--accent), #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Modal backdrop */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

/* Modal dialog */
.modal-dialog {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  max-width: 440px;
  width: 90%;
  border: 1px solid var(--border);
}

/* Card hover effect */
.card-hover {
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.card-hover:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* Mono font */
.mono {
  font-family: var(--font-mono);
}

/* Line height numeric */
.leading-none {
  line-height: 1;
}
.leading-snug {
  line-height: 1.25;
}

/* Font weight extra bold */
.font-extrabold {
  font-weight: 800;
}

/* Border left accent */
.border-l-accent {
  border-left: 3px solid var(--accent);
}
.border-l-green {
  border-left: 3px solid var(--green);
}

/* Flex gap common combos */
.inline-flex {
  display: inline-flex;
}

/* Pointer events */
.pointer-events-none {
  pointer-events: none;
}
.select-none {
  user-select: none;
}

/* Max widths for forms/content */
.max-w-form {
  max-width: 420px;
}
.max-w-content {
  max-width: 680px;
}
.max-w-wide {
  max-width: 960px;
}
```

**Step 2: 提交**

```bash
git add apps/web/src/app/globals.css
git commit -m "style: add new CSS utility classes for inline style cleanup"
```

---

### Task 2: Auth 页面清理 (auth/page.tsx, auth/reset, auth/verify)

**Files:**

- Modify: `apps/web/src/app/[locale]/auth/page.tsx`
- Modify: `apps/web/src/app/[locale]/auth/reset/page.tsx`
- Modify: `apps/web/src/app/[locale]/auth/verify/page.tsx`

**转换要点：**

- `auth/page.tsx` 定义了 `const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: "8px", ... }` — 替换为 `className="input w-full"` 并删除 inputStyle 常量
- 所有 `style={inputStyle}` 替换为 `className="input w-full"`
- `style={{ minHeight: "80vh" }}` 保留（特殊值）
- `style={{ maxWidth: "420px" }}` → `className="max-w-form"`
- `style={{ gap: "14px" }}` → `className="gap-3"` (12px ≈ 14px)
- `style={{ fontSize: "11px" }}` → `className="text-xs"` (12px 接近)
- `style={{ fontWeight: 500 }}` → `className="font-medium"`
- 按钮 padding/margin → 对应 utility class
- `auth/reset/page.tsx` 类似模式
- `auth/verify/page.tsx` 只有 2 个 style，简单转换

**提交：**

```bash
git commit -m "refactor(web): convert auth pages inline styles to CSS classes"
```

---

### Task 3: Settings 页面清理 (40 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx`

**转换要点：**

- 定义了 `inputStyle`、`labelStyle` 对象 — 替换为 `.input` / `.form-label` class
- Grid 布局: `style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}` → `className="grid-2"`
- Card padding: `style={{ padding: "24px" }}` → `className="p-6"`
- 按钮样式: 使用 `.btn` / `.btn-primary` / `.btn-secondary`
- 大量 `fontSize`、`fontWeight`、`color` 直接映射到 utility classes
- 保留动态: 如 2FA QR code 区域的条件样式

**提交：**

```bash
git commit -m "refactor(web): convert settings page inline styles to CSS classes (~40)"
```

---

### Task 4: Reconcile + Tax 页面清理 (55 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/reconcile/page.tsx`
- Modify: `apps/web/src/app/[locale]/tax/page.tsx`

**转换要点：**

- `reconcile/page.tsx` 定义了 `selectStyle`、`labelStyle` — 替换为 `.select-box` / `.form-label`
- `tax/page.tsx` 类似的 select/label 样式
- Grid auto-fit: `style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}` → `className="grid-auto-fit"` (调整 minmax)
- Section margin: `style={{ marginBottom: "20px" }}` → `className="mb-5"`
- 保留动态: 状态颜色（matched/mismatch 的 `borderLeft` 颜色依赖 STATUS_COLORS 对象）
- 保留动态: `netGainLossDiff` 条件颜色

**提交：**

```bash
git commit -m "refactor(web): convert reconcile and tax page inline styles to CSS classes (~55)"
```

---

### Task 5: Landing + Pricing 页面清理 (51 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/landing.tsx`
- Modify: `apps/web/src/app/[locale]/pricing/page.tsx`

**转换要点：**

- Hero gradient text: `style={{ background: "linear-gradient(...)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}` → `className="gradient-text"`
- Hero 的 `fontSize: "clamp(...)"` → 保留 inline（响应式 clamp 无法用 class）
- `fontWeight: 800` → `className="font-extrabold"`
- Section padding: `style={{ padding: "48px 0" }}` → `className="section-py-lg"`
- `style={{ padding: "32px 24px" }}` → `className="p-8 px-6"`
- `style={{ maxWidth: "640px", margin: "0 auto" }}` → `className="max-w-content mx-auto"`
- Card highlight border: `style={{ border: "2px solid var(--accent)" }}` → 保留（条件）
- `style={{ padding: "0 0 64px" }}` → `className="pb-16"` 或保留

**提交：**

```bash
git commit -m "refactor(web): convert landing and pricing inline styles to CSS classes (~51)"
```

---

### Task 6: For CPAs + Features + FAQ + Exchanges 页面清理 (83 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/for-cpas/page.tsx`
- Modify: `apps/web/src/app/[locale]/features/page.tsx`
- Modify: `apps/web/src/app/[locale]/faq/page.tsx`
- Modify: `apps/web/src/app/[locale]/exchanges/page.tsx`

**转换要点：**

- `for-cpas/page.tsx`: Hero gradient → `.gradient-text`, section padding → class, grid layouts → `.grid-auto-fit`
- `features/page.tsx`: Card padding/sizing → utility classes, bullet styling
- `faq/page.tsx`: Accordion padding/border → classes, `maxWidth: "680px"` → `className="max-w-content"`
- `exchanges/page.tsx`:
  - `onMouseEnter/onMouseLeave` hover 效果 → 替换为 `.card-hover` CSS class
  - Card transition styles → `.card-hover`
  - 删除 `onMouseEnter`/`onMouseLeave` 事件处理器

**提交：**

```bash
git commit -m "refactor(web): convert marketing pages inline styles to CSS classes (~83)"
```

---

### Task 7: Docs + Legal 页面清理 (48 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/docs/page.tsx`
- Modify: `apps/web/src/app/[locale]/docs/changelog/page.tsx`
- Modify: `apps/web/src/app/[locale]/legal/legal-page.tsx`

**转换要点：**

- 文档页面大量 section padding/margin → utility classes
- Changelog: timeline 样式（左边框、圆点）→ 保留特殊布局值，转换常规 padding/font
- Legal: `maxWidth: "800px"` → `className="max-w-lg"`, `lineHeight: 1.8` → 保留
- 标准 typography: `fontSize`, `fontWeight`, `color` → utility classes

**提交：**

```bash
git commit -m "refactor(web): convert docs and legal pages inline styles to CSS classes (~48)"
```

---

### Task 8: Admin + Clients 页面清理 (98 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/users/page.tsx`
- Modify: `apps/web/src/app/[locale]/clients/page.tsx`

**转换要点：**

- `admin/users/page.tsx`: 定义了 `thStyle`、`tdStyle` 对象 — 可以内联到 className 或创建 table 专用 class
- `clients/page.tsx`: 大量 card/button/input 样式 → utility classes
- Modal 弹窗: `position: "fixed"`, `inset: 0`, `zIndex: 9999` → `className="modal-backdrop"`
- Input fields: → `.input` class
- 搜索框样式: → `.input` class
- 分页按钮: padding/border → utility classes
- 保留动态: 用户角色条件颜色、展开/折叠状态

**提交：**

```bash
git commit -m "refactor(web): convert admin and clients pages inline styles to CSS classes (~98)"
```

---

### Task 9: Transaction 组件清理 (78 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/transactions/page.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/components/TransactionTable.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/components/ImportPanel.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/components/TransactionForm.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/components/AiReviewBanner.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/components/FilterBar.tsx`
- Modify: `apps/web/src/app/[locale]/transactions/components/ApiSyncPanel.tsx`

**转换要点：**

- `TransactionTable.tsx`: 表格 cell padding、input 样式、按钮 → utility classes
- `ImportPanel.tsx`: 文件上传区、状态显示 → classes
- `TransactionForm.tsx`: 表单 input → `.input` class
- `AiReviewBanner.tsx`: Banner 样式 → card/flex classes
- 页面级: filter bar 和 action buttons → classes
- 保留动态: 编辑状态的 input spread、条件颜色

**提交：**

```bash
git commit -m "refactor(web): convert transaction components inline styles to CSS classes (~78)"
```

---

### Task 10: Dashboard + 功能页面清理 (95 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/page.tsx` (dashboard)
- Modify: `apps/web/src/app/[locale]/compare/page.tsx`
- Modify: `apps/web/src/app/[locale]/simulator/page.tsx`
- Modify: `apps/web/src/app/[locale]/portfolio/page.tsx`
- Modify: `apps/web/src/app/[locale]/transfers/page.tsx`
- Modify: `apps/web/src/app/[locale]/specific-id-view.tsx`

**转换要点：**

- Dashboard: stat card grid → `.grid-auto-fit`, Quick Actions grid → class, card padding → classes
- Compare: 按钮/表格样式 → classes, 保留动态条件颜色
- Simulator: Select/input → `.select-box` / `.input`, card/section → classes
- Portfolio: Asset grid → classes, 价格输入 → `.input`
- Transfers: Asset 行样式 → classes
- Specific ID: Lot 显示 → classes, 保留动态选择状态

**提交：**

```bash
git commit -m "refactor(web): convert dashboard and functional pages inline styles to CSS classes (~95)"
```

---

### Task 11: 小文件清理 (71 styles)

**Files:**

- Modify: `apps/web/src/app/[locale]/ai-assistant/page.tsx`
- Modify: `apps/web/src/app/[locale]/ai-assistant/message-list.tsx`
- Modify: `apps/web/src/app/[locale]/ai-assistant/chat-input.tsx`
- Modify: `apps/web/src/app/[locale]/onboarding/page.tsx`
- Modify: `apps/web/src/app/[locale]/security/page.tsx`
- Modify: `apps/web/src/app/[locale]/notification-bell.tsx`
- Modify: `apps/web/src/app/[locale]/client-switcher.tsx`
- Modify: `apps/web/src/app/[locale]/auth-guard.tsx`
- Modify: `apps/web/src/app/[locale]/error.tsx`
- Modify: `apps/web/src/components/upgrade-modal.tsx`

**转换要点：**

- AI Assistant: sidebar 宽度保留（动态）、消息气泡条件背景保留、其余 padding/font → classes
- Onboarding: 进度条/步骤指示器 → classes, 动态 width 保留
- Security: 输入框 → `.input`, section → classes
- Notification bell: dropdown 定位保留（absolute + 计算值）、item padding → classes
- upgrade-modal: → `.modal-backdrop` + `.modal-dialog`
- Error/auth-guard: 少量简单转换

**提交：**

```bash
git commit -m "refactor(web): convert remaining small files inline styles to CSS classes (~71)"
```

---

### Task 12: 五步法审计

**Step 1: tsc**
Run: `pnpm -r exec tsc --noEmit`
Expected: 零错误

**Step 2: 测试**
Run: `pnpm test`
Expected: 全部通过（1120+ 测试）

**Step 3: 安全检查**
Run: `grep -rn "password\|secret\|sk_" apps/web/src/app/globals.css | head -5`
Expected: 无硬编码密钥

**Step 4: inline style 计数**
Run: `grep -rc "style={{" apps/web/src/app/\[locale\]/ apps/web/src/components/ | grep -v ":0$" | sort -t: -k2 -rn`
Expected: 总数 < 200（从 634 降低 >68%）

**Step 5: 构建**
Run: `pnpm build`
Expected: 5/5 成功

---

### 预期成果

| 指标                     | Before | After                        |
| ------------------------ | ------ | ---------------------------- |
| inline style 总数        | 634    | < 200                        |
| 新增 CSS utility classes | 0      | ~35                          |
| 减少率                   | —      | > 68%                        |
| 保留的动态 styles        | —      | ~180 (条件颜色/计算值/clamp) |
