# Auth & Dashboard UX Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the registration flow and user dashboard to production-ready quality with proper form UX, accessibility, and polish.

**Architecture:** Focused on high-ROI improvements — proper form labels, password strength, loading spinners, drag-drop upload, inline validation, and dark mode contrast fixes. No new dependencies or OAuth (deferred to post-launch).

**Tech Stack:** Next.js 14, React, TypeScript, Lucide icons, CSS variables, next-intl

---

## Priority Order

| #   | Task                                           | Impact | Area      |
| --- | ---------------------------------------------- | ------ | --------- |
| 1   | Auth form: add proper labels + accessibility   | High   | Auth      |
| 2   | Auth form: password strength indicator         | High   | Auth      |
| 3   | Auth form: inline validation + loading spinner | Medium | Auth      |
| 4   | Auth form: inline styles → CSS classes         | Medium | Auth      |
| 5   | CSV Import: drag-and-drop upload               | High   | Dashboard |
| 6   | Dark mode contrast fixes                       | Medium | Global    |
| 7   | Destructive actions: native confirm → Modal    | Medium | Dashboard |
| 8   | Dashboard: empty state "Get Started" polish    | Medium | Dashboard |

---

### Task 1: Auth Form — Add Proper Labels + Accessibility

**Files:**

- Modify: `apps/web/src/app/[locale]/auth/page.tsx`
- Modify: `apps/web/messages/en.json` (+ 6 other locales)

**Step 1: Add labels to all form inputs**

Replace placeholder-only inputs with proper `<label>` + `<input>` pairs. Each input gets an `id`, each label gets `htmlFor`:

```tsx
<div className="flex-col gap-1">
  <label htmlFor="auth-email" className="text-sm font-medium text-secondary">
    {t("emailLabel")}
  </label>
  <input
    id="auth-email"
    type="email"
    required
    placeholder={t("emailPlaceholder")}
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    className="input w-full"
    aria-required="true"
  />
</div>
```

Apply the same pattern for:

- Name input (`id="auth-name"`)
- Email input (`id="auth-email"`)
- Password input (`id="auth-password"`)
- 2FA code input (`id="auth-2fa-code"`)

**Step 2: Add `role="alert"` to error div**

```tsx
{
  error && (
    <div role="alert" className="auth-error">
      {error}
    </div>
  );
}
```

**Step 3: Add translation keys to all 7 locales**

Add `emailLabel`, `passwordLabel`, `nameLabel` to the `auth` namespace in each locale file.

**Step 4: Five-step audit + commit**

---

### Task 2: Auth Form — Password Strength Indicator

**Files:**

- Modify: `apps/web/src/app/[locale]/auth/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/messages/en.json` (+ 6 locales)

**Step 1: Add password strength calculation**

Add a `getPasswordStrength` function to the auth page (inline, not extracted — YAGNI):

```typescript
function getPasswordStrength(pw: string): { level: number; label: string } {
  if (!pw) return { level: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "weak" };
  if (score <= 3) return { level: 2, label: "medium" };
  return { level: 3, label: "strong" };
}
```

**Step 2: Add strength bar UI below password input (register mode only)**

```tsx
{
  mode === "register" && password && (
    <div className="password-strength">
      <div className="password-strength-bar">
        <div
          className={`password-strength-fill strength-${strength.label}`}
          style={{ width: `${(strength.level / 3) * 100}%` }}
        />
      </div>
      <span className={`text-xs strength-${strength.label}`}>
        {t(`passwordStrength.${strength.label}` as any)}
      </span>
    </div>
  );
}
```

**Step 3: Add CSS for strength bar**

```css
.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: -4px;
}
.password-strength-bar {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.password-strength-fill {
  height: 100%;
  border-radius: 2px;
  transition:
    width 0.3s ease,
    background 0.3s ease;
}
.strength-weak {
  color: var(--red);
}
.strength-weak .password-strength-fill,
.password-strength-fill.strength-weak {
  background: var(--red);
}
.strength-medium {
  color: var(--yellow);
}
.strength-medium .password-strength-fill,
.password-strength-fill.strength-medium {
  background: var(--yellow);
}
.strength-strong {
  color: var(--green);
}
.strength-strong .password-strength-fill,
.password-strength-fill.strength-strong {
  background: var(--green);
}
```

**Step 4: Add i18n keys**

```json
"passwordStrength": {
  "weak": "Weak",
  "medium": "Medium",
  "strong": "Strong"
}
```

Translate for all 7 locales.

**Step 5: Five-step audit + commit**

---

### Task 3: Auth Form — Inline Validation + Loading Spinner

**Files:**

- Modify: `apps/web/src/app/[locale]/auth/page.tsx`
- Modify: `apps/web/messages/en.json` (+ 6 locales)

**Step 1: Add field-level validation state**

```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

function validateField(field: string, value: string) {
  const errs = { ...fieldErrors };
  if (field === "email" && value && !/\S+@\S+\.\S+/.test(value)) {
    errs.email = t("invalidEmail");
  } else if (
    field === "password" &&
    mode === "register" &&
    value &&
    value.length < 8
  ) {
    errs.password = t("passwordTooShort");
  } else {
    delete errs[field];
  }
  setFieldErrors(errs);
}
```

**Step 2: Add `onBlur` validation to inputs**

```tsx
<input
  id="auth-email"
  type="email"
  required
  onBlur={(e) => validateField("email", e.target.value)}
  className={`input w-full ${fieldErrors.email ? "input-error" : ""}`}
  aria-invalid={!!fieldErrors.email}
  aria-describedby={fieldErrors.email ? "email-error" : undefined}
/>;
{
  fieldErrors.email && (
    <p id="email-error" className="text-xs text-loss mt-1">
      {fieldErrors.email}
    </p>
  );
}
```

**Step 3: Replace "Please wait..." text with Lucide Loader2 spinner**

```tsx
<button
  type="submit"
  className="btn btn-primary p-3 text-md font-semibold"
  disabled={submitting}
>
  {submitting ? (
    <span className="flex items-center justify-center gap-2">
      <Loader2 size={16} className="animate-spin" />
      {t("submitting")}
    </span>
  ) : mode === "login" ? (
    t("loginBtn")
  ) : (
    t("registerBtn")
  )}
</button>
```

Add `import { Loader2 } from "lucide-react"`.

**Step 4: Add CSS for input error state**

```css
.input-error {
  border-color: var(--red) !important;
}
```

**Step 5: Add i18n keys: `invalidEmail`, `passwordTooShort`**

**Step 6: Five-step audit + commit**

---

### Task 4: Auth Form — Inline Styles → CSS Classes

**Files:**

- Modify: `apps/web/src/app/[locale]/auth/page.tsx`
- Modify: `apps/web/src/app/globals.css`

**Step 1: Extract auth-specific styles to CSS**

```css
/* Auth page */
.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.auth-tab {
  flex: 1;
  padding: 10px;
  border: none;
  cursor: pointer;
  font-size: var(--text-base);
  font-weight: 500;
  background: var(--bg-secondary);
  color: var(--text-muted);
}
.auth-tab-active {
  background: var(--accent);
  color: white;
}
.auth-error {
  padding: 10px 14px;
  background: var(--red-bg);
  border-radius: 8px;
  color: var(--red-light);
  font-size: var(--text-sm);
}
.auth-2fa-code {
  font-family: monospace;
  letter-spacing: 0.3em;
}
.auth-2fa-recovery {
  font-family: monospace;
  letter-spacing: normal;
}
```

**Step 2: Replace all inline `style={{...}}` in auth/page.tsx with these classes**

**Step 3: Five-step audit + commit**

---

### Task 5: CSV Import — Drag-and-Drop Upload

**Files:**

- Modify: `apps/web/src/app/[locale]/transactions/ImportPanel.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/messages/en.json` (+ 6 locales)

**Step 1: Add drag-and-drop zone wrapping the file input**

```tsx
const [dragOver, setDragOver] = useState(false);

function handleDrop(e: React.DragEvent) {
  e.preventDefault();
  setDragOver(false);
  const file = e.dataTransfer.files[0];
  if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
    setFile(file);
  }
}

// In JSX:
<div
  className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
  onDragOver={(e) => {
    e.preventDefault();
    setDragOver(true);
  }}
  onDragLeave={() => setDragOver(false)}
  onDrop={handleDrop}
>
  <Upload size={32} className="text-muted mb-2" />
  <p className="text-base text-secondary">{t("dropCsv")}</p>
  <p className="text-sm text-muted mb-3">{t("orClickToSelect")}</p>
  <input
    type="file"
    accept=".csv,text/csv"
    onChange={(e) => setFile(e.target.files?.[0] || null)}
    className="drop-zone-input"
  />
</div>;
```

**Step 2: Add CSS**

```css
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
  position: relative;
}
.drop-zone:hover,
.drop-zone-active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.drop-zone-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
```

**Step 3: Add i18n keys: `dropCsv`, `orClickToSelect`**

**Step 4: Five-step audit + commit**

---

### Task 6: Dark Mode Contrast Fixes

**Files:**

- Modify: `apps/web/src/app/globals.css`

**Step 1: Improve text-muted contrast in dark mode**

In the `[data-theme="dark"]` section, increase contrast:

```css
[data-theme="dark"] {
  --text-muted: #94a3b8; /* was #64748b — bumped to 4.5:1+ on dark bg */
  --accent: #818cf8; /* was #6366f1 — bumped for AA on dark bg */
}
```

Verify: `#94a3b8` on `#0f1729` background = ~5.2:1 (passes AA).
Verify: `#818cf8` on `#0f1729` background = ~4.8:1 (passes AA).

**Step 2: Five-step audit + commit**

---

### Task 7: Destructive Actions — Native confirm → Modal

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx`
- Modify: `apps/web/messages/en.json` (+ 6 locales)

**Step 1: Replace `confirm()` calls with Modal component**

Add confirm state:

```typescript
const [confirmAction, setConfirmAction] = useState<{
  title: string;
  message: string;
  onConfirm: () => void;
} | null>(null);
```

Replace each `if (confirm("..."))` pattern:

```typescript
// Before:
if (confirm("Delete this data source?")) {
  handleDelete(id);
}

// After:
setConfirmAction({
  title: t("confirmDelete"),
  message: t("confirmDeleteMessage"),
  onConfirm: () => handleDelete(id),
});
```

Add Modal at the end of JSX:

```tsx
<Modal
  open={!!confirmAction}
  onClose={() => setConfirmAction(null)}
  title={confirmAction?.title}
>
  <p className="text-secondary text-base mb-4">{confirmAction?.message}</p>
  <div className="flex gap-3 justify-end">
    <button
      className="btn btn-secondary"
      onClick={() => setConfirmAction(null)}
    >
      {tc("cancel")}
    </button>
    <button
      className="btn btn-danger"
      onClick={() => {
        confirmAction?.onConfirm();
        setConfirmAction(null);
      }}
    >
      {tc("confirm")}
    </button>
  </div>
</Modal>
```

**Step 2: Add i18n keys for confirm titles/messages**

**Step 3: Five-step audit + commit**

---

### Task 8: Dashboard Empty State "Get Started" Polish

**Files:**

- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/messages/en.json` (+ 6 locales)

**Step 1: Enhance the "Get Started" card for new users**

Currently there's a basic 3-step guide. Upgrade to more visual cards with icons:

```tsx
{
  !hasTx && (
    <div className="card p-8">
      <h2 className="text-xl font-bold text-primary mb-4">
        {t("getStartedTitle")}
      </h2>
      <div className="grid-3">
        <Link
          href="/transactions"
          className="glass-card p-6 text-center no-underline hover-lift"
        >
          <Upload size={28} className="mx-auto mb-3 text-accent" />
          <p className="font-semibold text-primary">{t("step1Title")}</p>
          <p className="text-sm text-muted mt-1">{t("step1Desc")}</p>
        </Link>
        <Link
          href="/tax"
          className="glass-card p-6 text-center no-underline hover-lift"
        >
          <Calculator size={28} className="mx-auto mb-3 text-accent" />
          <p className="font-semibold text-primary">{t("step2Title")}</p>
          <p className="text-sm text-muted mt-1">{t("step2Desc")}</p>
        </Link>
        <Link
          href="/portfolio"
          className="glass-card p-6 text-center no-underline hover-lift"
        >
          <PieChart size={28} className="mx-auto mb-3 text-accent" />
          <p className="font-semibold text-primary">{t("step3Title")}</p>
          <p className="text-sm text-muted mt-1">{t("step3Desc")}</p>
        </Link>
      </div>
    </div>
  );
}
```

Add `hover-lift` CSS:

```css
.hover-lift {
  transition: transform 0.2s ease;
}
.hover-lift:hover {
  transform: translateY(-2px);
}
```

**Step 2: Add i18n keys for step titles/descriptions**

**Step 3: Five-step audit + commit**

---

## Execution Notes

- Each task ends with five-step audit: `tsc --noEmit` → tests → `next build` → commit → push
- Tasks 1-4 are auth form improvements (sequential — each builds on previous)
- Tasks 5-8 are dashboard improvements (independent)
- Total: 8 tasks, ~8 commits
