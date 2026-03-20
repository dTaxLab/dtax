# DTax UI/UX 设计系统与样式规范

> 基于 ui-ux-pro-max-skill 框架 + 金融 SaaS 最佳实践 + DTax 现状分析

---

## 一、设计定位

**产品类型：** 金融科技 SaaS (加密税务)
**设计风格：** Dark Mode-First + Minimal Financial Dashboard
**情绪关键词：** 冷静、专业、精确、可信赖
**字体配对：** Inter (正文) + JetBrains Mono (数字/代码) — 已采用，保持不变
**色彩情绪：** 深蓝-紫色调 (信任) + 绿/红 (盈亏) — 已采用，保持不变

**反模式（绝对不做）：**

- 不使用 AI 紫粉渐变（降低金融信任感）
- 不使用 emoji 作为功能图标（用 SVG: Lucide/Heroicons）
- 不使用过度动画（金融用户要效率，不要花哨）
- 不使用低对比度文字（WCAG AA 4.5:1 最低标准）

---

## 二、设计令牌系统 (Design Tokens)

### 2.1 颜色令牌（三层架构）

```css
/* === 原始令牌 (Primitive) === */
--gray-50: #f8fafc;    --gray-100: #f1f5f9;
--gray-200: #e2e8f0;   --gray-300: #cbd5e1;
--gray-400: #94a3b8;   --gray-500: #64748b;
--gray-600: #475569;   --gray-700: #334155;
--gray-800: #1e293b;   --gray-900: #0f172a;
--gray-950: #0a0e1a;

--indigo-400: #818cf8;  --indigo-500: #6366f1;
--indigo-600: #4f46e5;

--emerald-400: #34d399; --emerald-500: #10b981;
--red-400: #f87171;     --red-500: #ef4444;
--amber-400: #fbbf24;   --amber-500: #f59e0b;
--blue-500: #3b82f6;

/* === 语义令牌 (Semantic) — 已在 globals.css 中实现 === */
/* 通过 [data-theme="dark"] / [data-theme="light"] 切换 */
--bg-primary       /* 页面背景: dark=#0a0e1a, light=#f8fafc */
--bg-secondary     /* 区块背景: dark=#111827, light=#f1f5f9 */
--bg-card          /* 卡片背景: dark=#1e293b, light=#ffffff */
--text-primary     /* 主文本: dark=#f8fafc, light=#0f172a */
--text-secondary   /* 次文本: dark=#cbd5e1, light=#475569 */
--text-muted       /* 辅助文本: dark=#94a3b8, light=#64748b */
--accent           /* 品牌强调色: dark=#818cf8, light=#6366f1 */
--green            /* 盈利/正数 */
--red              /* 亏损/负数 */
--yellow           /* 警告/中性 */
--border           /* 边框: dark=rgba(255,255,255,0.1), light=rgba(0,0,0,0.1) */

/* === 组件令牌 (Component) — 待新增 === */
--btn-height-sm: 32px;
--btn-height-md: 38px;
--btn-height-lg: 44px;
--input-height: 38px;
--input-padding-x: 12px;
--input-padding-y: 8px;
--input-border-radius: 6px;
--input-font-size: 14px;
--card-padding: 20px;
--card-border-radius: var(--radius-md);
```

### 2.2 间距令牌（4px 基础网格）

```css
--space-0: 0; /* 0px */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* 语义间距 */
--gap-xs: var(--space-2); /* 8px  — 紧凑元素间 */
--gap-sm: var(--space-3); /* 12px — 表单元素间 */
--gap-md: var(--space-4); /* 16px — 卡片内组间 */
--gap-lg: var(--space-6); /* 24px — 区块间 */
--gap-xl: var(--space-8); /* 32px — 页面区块间 */
--gap-section: var(--space-12); /* 48px — 大区块分隔 */
```

### 2.3 排版令牌

```css
/* 字号（模块化比例 1.25） */
--text-xs: 12px; /* 辅助标签、徽章 */
--text-sm: 13px; /* 表单标签、表格内容 */
--text-base: 14px; /* 正文默认 */
--text-md: 15px; /* 卡片描述 */
--text-lg: 16px; /* 小标题 */
--text-xl: 18px; /* 区块标题 */
--text-2xl: 20px; /* 页面标题 */
--text-3xl: 24px; /* 大标题 */
--text-4xl: 30px; /* Hero 副标题 */
--text-5xl: 36px; /* Hero 主标题 */

/* 字重 */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* 行高 */
--leading-tight: 1.25; /* 标题 */
--leading-normal: 1.5; /* 正文 */
--leading-relaxed: 1.6; /* 长文本 */

/* 金融数字排版（关键！） */
.mono,
.stat-value,
td.amount {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

### 2.4 圆角令牌

```css
--radius-sm: 6px; /* 按钮、输入框、徽章 */
--radius-md: 8px; /* 卡片、弹窗 */
--radius-lg: 12px; /* 大卡片、模态框 */
--radius-xl: 16px; /* 容器级圆角 */
--radius-full: 9999px; /* 圆形 */
```

### 2.5 阴影令牌

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
--shadow-glow: 0 0 20px rgba(99, 102, 241, 0.3); /* 品牌发光 (indigo) */
```

### 2.6 动效令牌

```css
--duration-fast: 120ms; /* 按钮悬停、开关切换 */
--duration-normal: 200ms; /* 卡片展开、面板滑入 */
--duration-slow: 300ms; /* 模态框进出、页面转场 */

--ease-default: cubic-bezier(0.4, 0, 0.2, 1); /* 通用 */
--ease-in: cubic-bezier(0.4, 0, 1, 1); /* 退出 */
--ease-out: cubic-bezier(0, 0, 0.2, 1); /* 进入 */
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性 */
```

### 2.7 Z-index 层级

```css
--z-dropdown: 1000;
--z-sticky: 1100;
--z-modal-backdrop: 1200;
--z-modal: 1300;
--z-popover: 1400;
--z-tooltip: 1500;
```

---

## 三、组件规范

### 3.1 按钮 (Button)

| 变体              | 用途                      | 样式                   |
| ----------------- | ------------------------- | ---------------------- |
| `btn-primary`     | 主操作 (Simulate, Import) | accent 背景，白色文字  |
| `btn-secondary`   | 次操作 (Cancel, Back)     | 透明背景，accent 边框  |
| `btn-ghost`       | 低优先级 (Filter, Reset)  | 透明背景，hover 时背景 |
| `btn-destructive` | 危险操作 (Delete)         | red 背景，白色文字     |

**尺寸：** sm(32px高) / md(38px高) / lg(44px高，最小触控目标)
**状态：** default → hover(亮度+5%) → active(亮度-5%) → disabled(opacity 0.5) → loading(spinner)
**过渡：** `transition: all var(--duration-fast) var(--ease-default)`

### 3.2 输入框 (Input)

```css
.input {
  height: var(--input-height);
  padding: var(--input-padding-y) var(--input-padding-x);
  border: 1px solid var(--border);
  border-radius: var(--input-border-radius);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--input-font-size);
  transition: border-color var(--duration-fast);
}
.input:focus {
  border-color: var(--accent);
  outline: 2px solid var(--accent-glow);
  outline-offset: -1px;
}
.input-error {
  border-color: var(--red);
}
```

### 3.3 卡片 (Card)

| 变体 | CSS 类              | 用途                         |
| ---- | ------------------- | ---------------------------- |
| 默认 | `.card`             | 内容容器                     |
| 玻璃 | `.card-glass`       | Landing 页特性               |
| 统计 | `.stat-card`        | Dashboard KPI                |
| 交互 | `.card-interactive` | 可点击卡片（hover 阴影提升） |

### 3.4 表格 (Table)

- 表头: `text-muted`, `font-semibold`, `text-xs`, 大写
- 行: hover 时背景 `var(--bg-card-hover)`
- 金额列: `text-align: right`, `font-variant-numeric: tabular-nums`
- 盈亏: 正数 `var(--green)`, 负数 `var(--red)`
- 长文本: `text-overflow: ellipsis`, `max-width` 限制

### 3.5 徽章 (Badge)

```css
.badge {
  /* 基础 */
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}
/* 语义变体 */
.badge-success {
  background: rgba(16, 185, 129, 0.1);
  color: var(--green);
}
.badge-danger {
  background: rgba(239, 68, 68, 0.1);
  color: var(--red);
}
.badge-warning {
  background: rgba(245, 158, 11, 0.1);
  color: var(--yellow);
}
.badge-info {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent);
}
```

### 3.6 待补充组件

| 组件         | 优先级 | 说明                           |
| ------------ | ------ | ------------------------------ |
| Modal/Dialog | P0     | 目前只有 UpgradeModal 内联实现 |
| Toast/Alert  | P0     | 成功/错误反馈（替代 alert()）  |
| Skeleton     | P1     | 数据加载占位                   |
| Tabs         | P1     | 页面内区块切换                 |
| Dropdown     | P2     | 非导航下拉                     |
| Tooltip      | P2     | 数据说明悬浮提示               |
| Pagination   | P2     | 提取为独立组件                 |

---

## 四、布局规范

### 4.1 响应式断点

```css
/* Mobile First */
@media (min-width: 480px) {
  /* 小平板 */
}
@media (min-width: 768px) {
  /* 平板 */
}
@media (min-width: 900px) {
  /* Nav 切换点 */
}
@media (min-width: 1024px) {
  /* 桌面 */
}
@media (min-width: 1440px) {
  /* 宽屏 */
}
```

### 4.2 页面布局

```
┌─────────────────────────────────────────┐
│  Nav (sticky, z-sticky, 60px 高)         │
├─────────────────────────────────────────┤
│  Page Header (title + subtitle + actions)│
├─────────────────────────────────────────┤
│  Content (max-width: 1200px, 居中)       │
│  ┌──── grid-4 ────────────────────┐     │
│  │ stat  │ stat  │ stat  │ stat   │     │
│  └────────────────────────────────┘     │
│  ┌──── card ──────────────────────┐     │
│  │ 主要内容区                      │     │
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
```

### 4.3 网格系统

```css
.grid-2 {
  grid-template-columns: repeat(2, 1fr);
}
.grid-3 {
  grid-template-columns: repeat(3, 1fr);
}
.grid-4 {
  grid-template-columns: repeat(4, 1fr);
}

/* 响应式折叠 */
@media (max-width: 768px) {
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid-3 {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 480px) {
  .grid-4 {
    grid-template-columns: 1fr;
  }
}
```

---

## 五、动画规范

### 5.1 基础过渡

```css
/* 所有可交互元素默认 */
.interactive {
  transition: all var(--duration-fast) var(--ease-default);
}

/* 按钮悬停 */
.btn:hover {
  filter: brightness(1.1);
}
.btn:active {
  filter: brightness(0.95);
  transform: scale(0.98);
}

/* 卡片悬停 */
.card:hover {
  border-color: var(--border-hover);
}
.stat-card:hover {
  transform: translateY(-2px);
}
```

### 5.2 页面进入动画

```css
.animate-in {
  animation: fadeSlideIn var(--duration-slow) var(--ease-out);
}
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 5.3 数字变化动画（金融特有）

```css
/* 金额变化时的数字滚动效果 */
.number-animate {
  transition: all var(--duration-normal) var(--ease-default);
}
```

### 5.4 尊重用户偏好

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 六、无障碍规范

### 6.1 色彩对比度

| 元素                  | 最低对比度 | 备注         |
| --------------------- | ---------- | ------------ |
| 正文文字              | 4.5:1 (AA) | 必须         |
| 大号标题 (≥18px bold) | 3:1 (AA)   | 必须         |
| 交互元素边框          | 3:1        | 按钮、输入框 |
| 装饰元素              | 无要求     | 纯视觉       |

### 6.2 交互目标

- 最小触控目标: **44x44px** (移动端)
- 元素间距: **最小 8px**
- 所有可交互元素: `cursor: pointer`
- 焦点环: 2px solid var(--accent), 不使用 outline: none

### 6.3 语义 HTML

- 导航: `<nav aria-label="Main navigation">`
- 区块: `<section aria-labelledby="section-title">`
- 表格: `<th scope="col">`, `<caption>`
- 表单: `<label>` 绑定 `for`, 错误用 `aria-describedby`

### 6.4 盈亏不仅靠颜色

```
正确: +$1,234.56 (绿色 + 正号)
正确: -$567.89  (红色 + 负号)
错误: $1,234.56 (仅绿色, 无正号)
```

---

## 七、当前痛点与改进路线

### 7.1 现状问题

| 问题         | 严重性 | 数据                                  |
| ------------ | ------ | ------------------------------------- |
| 内联样式过度 | **P0** | 1,159 处 style={} vs 399 处 className |
| 间距不一致   | P1     | gap: 12/16/24px 混用无规则            |
| 圆角不一致   | P1     | 6px/8px/12px/100px 硬编码             |
| 字号不一致   | P1     | 13/14/15/18px 无系统                  |
| 缺少基础组件 | P1     | Modal/Toast/Skeleton/Tabs 无标准实现  |
| 响应式不足   | P2     | 仅 3 个 @media 查询                   |
| 动画简陋     | P2     | 仅 3 个 keyframe                      |

### 7.2 改进路线（渐进式，不大改）

**Phase 1: 设计令牌标准化 (globals.css 扩展)**

- 新增间距令牌 `--space-*` 和 `--gap-*`
- 新增排版令牌 `--text-*`
- 新增组件令牌 `--btn-*`, `--input-*`, `--card-*`
- 新增动效令牌 `--duration-*`, `--ease-*`

**Phase 2: 高频内联样式提取为 CSS 类**

- `.input` — 统一输入框样式（消除 ~200 处内联）
- `.form-group` — label + input 组合（消除 ~100 处内联）
- `.flex-between` / `.flex-center` — 常用 flex 布局
- `.text-gain` / `.text-loss` — 盈亏颜色
- `.section-gap` — 区块间距

**Phase 3: 基础组件库**

- Modal 组件（含动画进出）
- Toast 通知组件
- Skeleton 加载占位
- 标准化 Badge 变体

**Phase 4: 响应式增强**

- 数据表格移动端卡片布局
- Dashboard stat-card 移动端 2 列 → 1 列
- 所有表单移动端全宽

**Phase 5: 动画增强**

- 数据加载骨架屏
- 数字滚动动画（金额变化）
- 页面转场平滑

---

## 八、CSS 工作流

### 8.1 新增样式的决策流程

```
需要写样式?
    │
    ├─ 是否已有 CSS 类? → 直接用 className
    │
    ├─ 是否为通用模式（≥3 处使用）? → 在 globals.css 新增 CSS 类
    │
    ├─ 是否为组件特有? → 使用 CSS 变量组合 className
    │
    └─ 真的只用一次? → 允许 style={}，但必须使用 CSS 变量值
```

### 8.2 代码审查 CSS 检查清单

- [ ] 不使用硬编码颜色（必须用 `var(--*)` 变量）
- [ ] 不使用硬编码间距（优先用 `var(--space-*)` 或 `var(--gap-*)`）
- [ ] 不使用硬编码圆角（用 `var(--radius-*)`）
- [ ] 盈亏金额有正/负号标识（不仅靠颜色）
- [ ] 金额数字使用 `.mono` 类（tabular-nums 对齐）
- [ ] 新增可交互元素有 hover + focus 状态
- [ ] 移动端可用（测试 375px 宽度）
- [ ] 尊重 `prefers-reduced-motion`
- [ ] 文字对比度 ≥ 4.5:1

### 8.3 文件组织

```
apps/web/src/app/
├── globals.css          ← 设计令牌 + 基础组件 + 布局 + 动画
├── [locale]/
│   ├── layout.tsx       ← 主题脚本 + 全局 providers
│   ├── nav.tsx          ← 导航（已有完整样式）
│   └── [page]/page.tsx  ← 页面级样式用 className 优先
```

**原则：globals.css 是唯一的样式真相来源。不创建额外 CSS 文件。**

---

## 九、参考资源

- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — 161 条规则 + 67 种风格 + 161 套配色
- [Carbon Design System 间距](https://carbondesignsystem.com/elements/spacing/overview/) — 4px 网格标准
- [SaaSFrame Dashboard 案例](https://www.saasframe.io/categories/dashboard) — 166+ SaaS 仪表盘参考
- [EY Crypto Tax App](https://cakeandarrow.com/work/ey-crypto-tax-filing-app/) — 安永加密税务 UI 案例
