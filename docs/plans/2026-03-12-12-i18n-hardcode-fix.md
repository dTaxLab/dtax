# i18n 硬编码修复 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 nav.tsx 中 2 处硬编码英文 aria-label，确保无障碍标签完全国际化。

**Architecture:** 直接修改 nav.tsx，使用 `useTranslations("nav")` 替换硬编码字符串。同时在 messages 中添加对应翻译 key。

**Tech Stack:** next-intl, React

---

### Task 1: 添加 i18n 翻译 key

**Files:**

- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`

**Step 1: 在 "nav" 命名空间中添加 aria-label 翻译**

EN (`messages/en.json`):

```json
{
  "nav": {
    // ... existing keys ...
    "switchToLightMode": "Switch to light mode",
    "switchToDarkMode": "Switch to dark mode",
    "switchToLocale": "Switch to {locale}"
  }
}
```

ZH (`messages/zh.json`):

```json
{
  "nav": {
    // ... existing keys ...
    "switchToLightMode": "切换到浅色模式",
    "switchToDarkMode": "切换到深色模式",
    "switchToLocale": "切换到{locale}"
  }
}
```

**Step 2: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "feat(i18n): add aria-label translation keys for nav theme/locale toggles"
```

---

### Task 2: 修改 nav.tsx — 替换硬编码

**Files:**

- Modify: `apps/web/src/app/[locale]/nav.tsx`

**Step 1: 替换主题切换 aria-label**

```typescript
// Before (line ~199):
aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}

// After:
aria-label={theme === "dark" ? t("switchToLightMode") : t("switchToDarkMode")}
```

**Step 2: 替换语言切换 aria-label**

```typescript
// Before (line ~208):
aria-label={`Switch to ${otherLocale === "en" ? "English" : "中文"}`}

// After:
aria-label={t("switchToLocale", { locale: otherLocale === "en" ? "English" : "中文" })}
```

**Step 3: 验证 `t` 已从 `useTranslations("nav")` 获取**

确认 nav.tsx 中已有:

```typescript
const t = useTranslations("nav");
```

**Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/nav.tsx
git commit -m "fix(i18n): replace hardcoded English aria-labels in nav with translations"
```

---

### Task 3: 五步法审计

**Step 1: 类型安全** — `cd apps/web && npx tsc --noEmit`

**Step 2: 测试回归** — `pnpm test` + `cd apps/web && npx playwright test e2e/navigation.spec.ts`

**Step 3: 安全** — N/A（纯 UI 文本修改）

**Step 4: i18n 完整性**

Run: 验证 en.json 和 zh.json 中 nav 命名空间 key 数量相同:

```bash
node -e "
const en = require('./apps/web/messages/en.json');
const zh = require('./apps/web/messages/zh.json');
const enKeys = Object.keys(en.nav).sort();
const zhKeys = Object.keys(zh.nav).sort();
console.log('EN nav keys:', enKeys.length);
console.log('ZH nav keys:', zhKeys.length);
const missing = enKeys.filter(k => !zhKeys.includes(k));
if (missing.length) console.log('Missing in ZH:', missing);
else console.log('All keys present in both languages');
"
```

Expected: `All keys present in both languages`

**Step 5: 构建** — `pnpm build`
