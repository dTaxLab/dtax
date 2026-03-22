# DTax UI/UX Design System & Style Guide

> Based on financial SaaS best practices. Dark Mode-First, Minimal Financial Dashboard.

---

## 1. Design Principles

**Product type:** FinTech SaaS (crypto tax)
**Visual style:** Dark Mode-First · Minimal Financial Dashboard
**Brand keywords:** Calm · Professional · Precise · Trustworthy
**Typography:** Inter (body) + JetBrains Mono (numbers/code)
**Color palette:** Deep blue-purple (trust) + green/red (gain/loss)

**Anti-patterns (never do):**

- No AI purple-pink gradients (undermines financial credibility)
- No emoji as functional icons (use SVG: Lucide/Heroicons)
- No excessive animation (financial users want efficiency)
- No low-contrast text (WCAG AA 4.5:1 minimum)

---

## 2. Design Token System

### 2.1 Color Tokens (three-layer architecture)

```css
/* === Primitive Tokens === */
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

/* === Semantic Tokens — implemented in globals.css === */
/* Switch via [data-theme="dark"] / [data-theme="light"] */
--bg-primary       /* page background: dark=#0a0e1a, light=#f8fafc */
--bg-secondary     /* section background: dark=#111827, light=#f1f5f9 */
--bg-card          /* card background: dark=#1e293b, light=#ffffff */
--text-primary     /* main text: dark=#f8fafc, light=#0f172a */
--text-secondary   /* secondary text: dark=#cbd5e1, light=#475569 */
--text-muted       /* muted text: dark=#94a3b8, light=#64748b */
--accent           /* brand accent: dark=#818cf8, light=#6366f1 */
--green            /* gain / positive */
--red              /* loss / negative */
--yellow           /* warning / neutral */
--border           /* border: dark=rgba(255,255,255,0.1), light=rgba(0,0,0,0.1) */

/* === Component Tokens === */
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

### 2.2 Spacing Tokens (4px base grid)

```css
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
--space-16: 64px;

/* Semantic spacing */
--gap-xs: var(--space-2); /* 8px  — tight elements */
--gap-sm: var(--space-3); /* 12px — form elements */
--gap-md: var(--space-4); /* 16px — groups within cards */
--gap-lg: var(--space-6); /* 24px — between sections */
--gap-xl: var(--space-8); /* 32px — page sections */
--gap-section: var(--space-12); /* 48px — major section dividers */
```

### 2.3 Typography Tokens

```css
/* Font sizes (modular scale 1.25) */
--text-xs: 12px; /* labels, badges */
--text-sm: 13px; /* form labels, table content */
--text-base: 14px; /* body default */
--text-md: 15px; /* card descriptions */
--text-lg: 16px; /* minor headings */
--text-xl: 18px; /* section headings */
--text-2xl: 20px; /* page titles */
--text-3xl: 24px; /* large headings */
--text-4xl: 30px; /* hero subtitles */
--text-5xl: 36px; /* hero titles */

/* Font weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* Line heights */
--leading-tight: 1.25; /* headings */
--leading-normal: 1.5; /* body */
--leading-relaxed: 1.6; /* long-form text */

/* Financial number typography (critical!) */
.mono,
.stat-value,
td.amount {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

### 2.4 Border Radius Tokens

```css
--radius-sm: 6px; /* buttons, inputs, badges */
--radius-md: 8px; /* cards, dialogs */
--radius-lg: 12px; /* large cards, modals */
--radius-xl: 16px; /* container-level rounding */
--radius-full: 9999px; /* circles */
```

### 2.5 Shadow Tokens

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
--shadow-glow: 0 0 20px rgba(99, 102, 241, 0.3); /* brand glow (indigo) */
```

### 2.6 Motion Tokens

```css
--duration-fast: 120ms; /* button hover, toggle */
--duration-normal: 200ms; /* card expand, panel slide */
--duration-slow: 300ms; /* modal, page transition */

--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1); /* exit */
--ease-out: cubic-bezier(0, 0, 0.2, 1); /* enter */
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 2.7 Z-index Scale

```css
--z-dropdown: 1000;
--z-sticky: 1100;
--z-modal-backdrop: 1200;
--z-modal: 1300;
--z-popover: 1400;
--z-tooltip: 1500;
```

---

## 3. Component Specifications

### 3.1 Button

| Variant           | Usage                           | Style                                 |
| ----------------- | ------------------------------- | ------------------------------------- |
| `btn-primary`     | Primary action (Submit, Import) | accent background, white text         |
| `btn-secondary`   | Secondary action (Cancel, Back) | transparent background, accent border |
| `btn-ghost`       | Low-priority (Filter, Reset)    | transparent, background on hover      |
| `btn-destructive` | Destructive action (Delete)     | red background, white text            |

**Heights:** sm(32px) / md(38px) / lg(44px — minimum touch target)
**States:** default → hover(brightness+5%) → active(brightness-5%) → disabled(opacity 0.5) → loading(spinner)
**Transition:** `transition: all var(--duration-fast) var(--ease-default)`

### 3.2 Input

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

### 3.3 Card

| Variant     | CSS Class           | Usage                                   |
| ----------- | ------------------- | --------------------------------------- |
| Default     | `.card`             | Content container                       |
| Glass       | `.card-glass`       | Landing page features                   |
| Stat        | `.stat-card`        | Dashboard KPIs                          |
| Interactive | `.card-interactive` | Clickable card (hover shadow elevation) |

### 3.4 Table

- Header: `text-muted`, `font-semibold`, `text-xs`, uppercase
- Row: hover background `var(--bg-card-hover)`
- Amount columns: `text-align: right`, `font-variant-numeric: tabular-nums`
- Gain/loss: positive `var(--green)`, negative `var(--red)`
- Long text: `text-overflow: ellipsis`, constrained `max-width`

### 3.5 Badge

```css
.badge {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}
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

---

## 4. Layout

### 4.1 Responsive Breakpoints

```css
/* Mobile First */
@media (min-width: 480px) {
  /* small tablet */
}
@media (min-width: 768px) {
  /* tablet */
}
@media (min-width: 900px) {
  /* nav breakpoint */
}
@media (min-width: 1024px) {
  /* desktop */
}
@media (min-width: 1440px) {
  /* wide screen */
}
```

### 4.2 Page Layout

```
┌─────────────────────────────────────────┐
│  Nav (sticky, z-sticky, 60px height)    │
├─────────────────────────────────────────┤
│  Page Header (title + subtitle + actions│
├─────────────────────────────────────────┤
│  Content (max-width: 1200px, centered)  │
│  ┌──── grid-4 ─────────────────────┐   │
│  │ stat  │ stat  │ stat  │ stat    │   │
│  └─────────────────────────────────┘   │
│  ┌──── card ───────────────────────┐   │
│  │ main content                    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 4.3 Grid System

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

## 5. Animation

### 5.1 Base Transitions

```css
.interactive {
  transition: all var(--duration-fast) var(--ease-default);
}

.btn:hover {
  filter: brightness(1.1);
}
.btn:active {
  filter: brightness(0.95);
  transform: scale(0.98);
}

.card:hover {
  border-color: var(--border-hover);
}
.stat-card:hover {
  transform: translateY(-2px);
}
```

### 5.2 Page Enter Animation

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

### 5.3 Number Change Animation

```css
.number-animate {
  transition: all var(--duration-normal) var(--ease-default);
}
```

### 5.4 Respect User Preferences

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

## 6. Accessibility

### 6.1 Color Contrast

| Element                     | Minimum ratio | Note            |
| --------------------------- | ------------- | --------------- |
| Body text                   | 4.5:1 (AA)    | Required        |
| Large headings (≥18px bold) | 3:1 (AA)      | Required        |
| Interactive element borders | 3:1           | Buttons, inputs |
| Decorative elements         | None          | Visual only     |

### 6.2 Touch Targets

- Minimum touch target: **44×44px** (mobile)
- Element spacing: **minimum 8px**
- All interactive elements: `cursor: pointer`
- Focus ring: 2px solid var(--accent), never `outline: none`

### 6.3 Semantic HTML

- Navigation: `<nav aria-label="Main navigation">`
- Sections: `<section aria-labelledby="section-title">`
- Tables: `<th scope="col">`, `<caption>`
- Forms: `<label>` bound with `for`, errors via `aria-describedby`

### 6.4 Gain/Loss Must Not Rely on Color Alone

```
Correct: +$1,234.56 (green + plus sign)
Correct: -$567.89  (red + minus sign)
Wrong:   $1,234.56 (green only, no sign)
```

---

## 7. CSS Workflow

### 7.1 Decision Flow for New Styles

```
Need to write a style?
    │
    ├─ Does a CSS class already exist? → use className
    │
    ├─ Used in ≥3 places (common pattern)? → add CSS class to globals.css
    │
    ├─ Component-specific? → compose with CSS variable + className
    │
    └─ Truly one-off? → style={} allowed, but must use CSS variable values
```

### 7.2 CSS Code Review Checklist

- [ ] No hardcoded colors (must use `var(--)` variables)
- [ ] No hardcoded spacing (prefer `var(--space-*)` or `var(--gap-*)`)
- [ ] No hardcoded border-radius (use `var(--radius-*)`)
- [ ] Gain/loss amounts have +/- sign (not color alone)
- [ ] Monetary numbers use `.mono` class (tabular-nums alignment)
- [ ] New interactive elements have hover + focus states
- [ ] Mobile-friendly (tested at 375px width)
- [ ] Respects `prefers-reduced-motion`
- [ ] Text contrast ≥ 4.5:1

### 7.3 File Organization

```
apps/web/src/app/
├── globals.css          ← design tokens + base components + layout + animation
├── [locale]/
│   ├── layout.tsx       ← theme script + global providers
│   ├── nav.tsx          ← navigation
│   └── [page]/page.tsx  ← page-level styles use className first
```

**Rule: `globals.css` is the single source of truth for styles. Do not create additional CSS files.**

---

## 8. References

- [Carbon Design System Spacing](https://carbondesignsystem.com/elements/spacing/overview/) — 4px grid standard
- [SaaSFrame Dashboard Examples](https://www.saasframe.io/categories/dashboard) — 166+ SaaS dashboard references
