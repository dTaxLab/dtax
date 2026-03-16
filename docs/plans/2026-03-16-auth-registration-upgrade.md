# Auth Registration Upgrade Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce email verification after registration and add Google/GitHub OAuth social login.

**Architecture:** Two independent features: (1) Email verification gate — add middleware check for `emailVerified`, redirect unverified users to a verification-required page. (2) OAuth social login — use direct OAuth 2.0 Authorization Code flow with Google and GitHub, no NextAuth.js (YAGNI). Backend handles token exchange, frontend has "Continue with Google/GitHub" buttons.

**Tech Stack:** Fastify, Prisma, @fastify/jwt, next-intl, Resend email, Google OAuth 2.0, GitHub OAuth

---

## Priority Order

| #   | Task                                                  | Impact | Area |
| --- | ----------------------------------------------------- | ------ | ---- |
| 1   | Enforce email verification in auth middleware         | High   | API  |
| 2   | Add verification-required page + resend button        | High   | Web  |
| 3   | Google OAuth backend (token exchange + user creation) | High   | API  |
| 4   | GitHub OAuth backend                                  | High   | API  |
| 5   | Social login buttons on auth page                     | High   | Web  |

---

### Task 1: Enforce Email Verification in Auth Middleware

**Files:**

- Modify: `apps/api/src/plugins/auth.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/__tests__/auth.test.ts`

**Step 1: Write the failing test**

In `apps/api/src/__tests__/auth.test.ts`, add a test that verifies unverified users get 403 on protected routes:

```typescript
it("should return 403 for unverified email on protected routes", async () => {
  // Mock user with emailVerified=false
  mockPrisma.user.findUnique.mockResolvedValueOnce({
    id: "user-1",
    email: "test@test.com",
    emailVerified: false,
    role: "USER",
  } as any);

  const res = await app.inject({
    method: "GET",
    url: "/api/v1/transactions",
    headers: { authorization: `Bearer ${validToken}` },
  });
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe("EMAIL_NOT_VERIFIED");
});
```

**Step 2: Modify auth plugin to check emailVerified**

In `apps/api/src/plugins/auth.ts`, after JWT verification (line ~63), add:

```typescript
// Routes that don't require email verification
const verificationExemptPaths = [
  "/api/v1/auth/me",
  "/api/v1/auth/verify-email",
  "/api/v1/auth/refresh",
  "/api/v1/auth/resend-verification",
];

// After setting request.userId and request.userRole:
if (!verificationExemptPaths.some((p) => url.startsWith(p))) {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { emailVerified: true },
  });
  if (user && !user.emailVerified) {
    return reply.status(403).send({
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email address before continuing",
      },
    });
  }
}
```

**Step 3: Add resend-verification endpoint to auth routes**

In `apps/api/src/routes/auth.ts`, add:

```typescript
// POST /auth/resend-verification
r.post(
  "/auth/resend-verification",
  {
    schema: {
      tags: ["auth"],
      operationId: "resendVerification",
      response: {
        200: z.object({ data: z.object({ sent: z.boolean() }) }),
      },
    },
  },
  async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { email: true, emailVerified: true },
    });
    if (!user || user.emailVerified) {
      return reply.send({ data: { sent: false } });
    }
    const verifyToken = app.jwt.sign(
      { sub: user.email, purpose: "email-verify" },
      { expiresIn: "24h" },
    );
    const verifyUrl = `${config.appUrl}/auth/verify?token=${verifyToken}`;
    await sendEmail({
      to: user.email,
      ...verificationEmail(verifyUrl),
    }).catch(() => {});
    return reply.send({ data: { sent: true } });
  },
);
```

**Step 4: Add resend-verification to auth whitelist exempt paths**

The resend endpoint requires auth (user must be logged in) but NOT email verification (chicken-and-egg). This is already handled by `verificationExemptPaths` above.

**Step 5: Run tests + tsc + commit**

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/api test -- --run
git commit -m "feat(api): enforce email verification in auth middleware"
```

---

### Task 2: Verification-Required Page + Resend Button

**Files:**

- Create: `apps/web/src/app/[locale]/auth/verify-required/page.tsx`
- Modify: `apps/web/src/lib/auth-context.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/messages/en.json` (+ 6 locales)

**Step 1: Add `resendVerification` API function**

In `apps/web/src/lib/api.ts`:

```typescript
export async function resendVerification() {
  return apiFetch<{ data: { sent: boolean } }>(
    "/api/v1/auth/resend-verification",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}
```

**Step 2: Update auth context to track emailVerified**

In `apps/web/src/lib/auth-context.tsx`, the `AuthUser` type should include `emailVerified`. The `authGetMe()` response already includes it. Make sure the context exposes it.

**Step 3: Create verify-required page**

```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { resendVerification } from "@/lib/api";
import { Loader2, Mail } from "lucide-react";

export default function VerifyRequiredPage() {
  const t = useTranslations("auth");
  const { user, logout } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleResend() {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {}
    setSending(false);
  }

  return (
    <div className="flex-center auth-page-wrapper">
      <div className="card w-full p-8 max-w-form text-center">
        <Mail size={48} className="mx-auto mb-4 text-accent" />
        <h1 className="text-2xl font-bold mb-2">{t("verifyRequired")}</h1>
        <p className="text-muted text-base mb-6">
          {t("verifyRequiredDesc", { email: user?.email || "" })}
        </p>
        {sent ? (
          <p className="text-sm text-green">{t("verificationSent")}</p>
        ) : (
          <button
            onClick={handleResend}
            className="btn btn-primary p-3 text-md font-semibold w-full"
            disabled={sending}
          >
            {sending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                {t("submitting")}
              </span>
            ) : (
              t("resendVerification")
            )}
          </button>
        )}
        <button
          onClick={logout}
          className="text-accent text-sm cursor-pointer mt-4 auth-toggle-btn"
        >
          {t("logoutAndTryAgain")}
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Add redirect logic for 403 EMAIL_NOT_VERIFIED**

In `apps/web/src/lib/api.ts` `apiFetch`, when receiving 403 with code `EMAIL_NOT_VERIFIED`, redirect to `/auth/verify-required`:

```typescript
if (res.status === 403) {
  const errData = await res.json().catch(() => ({}));
  if (errData?.error?.code === "EMAIL_NOT_VERIFIED") {
    if (typeof window !== "undefined") {
      window.location.href = "/auth/verify-required";
    }
    throw new ApiError("EMAIL_NOT_VERIFIED", "Email verification required");
  }
}
```

**Step 5: Add i18n keys in all 7 locales**

```json
"verifyRequired": "Verify Your Email",
"verifyRequiredDesc": "We sent a verification link to {email}. Please check your inbox and click the link to continue.",
"verificationSent": "Verification email sent! Check your inbox.",
"resendVerification": "Resend Verification Email",
"logoutAndTryAgain": "Use a different account"
```

Translate for zh, zh-Hant, es, ja, ko, pt.

**Step 6: tsc + build + commit**

```bash
pnpm --filter @dtax/web exec tsc --noEmit
git commit -m "feat(web): add email verification required page with resend"
```

---

### Task 3: Google OAuth Backend

**Files:**

- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/plugins/auth.ts` (whitelist)
- Modify: `apps/api/src/__tests__/auth.test.ts`

**Step 1: Add config vars**

In `apps/api/src/config.ts`:

```typescript
googleClientId: process.env.GOOGLE_CLIENT_ID || "",
googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
```

**Step 2: Add OAuth callback whitelist**

In `apps/api/src/plugins/auth.ts`, add to public routes:

```
/api/v1/auth/oauth/google/callback
/api/v1/auth/oauth/github/callback
```

**Step 3: Add Google OAuth endpoint**

In `apps/api/src/routes/auth.ts`:

```typescript
// POST /auth/oauth/google — Exchange Google auth code for JWT
r.post(
  "/auth/oauth/google/callback",
  {
    schema: {
      tags: ["auth"],
      operationId: "googleOAuthCallback",
      body: z.object({ code: z.string(), redirectUri: z.string() }),
      response: { 200: authResponseSchema, 400: errorResponseSchema },
    },
  },
  async (request, reply) => {
    const { code, redirectUri } = request.body;
    if (!config.googleClientId || !config.googleClientSecret) {
      return reply.status(503).send({
        error: {
          code: "NOT_CONFIGURED",
          message: "Google OAuth is not configured",
        },
      });
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return reply.status(400).send({
        error: {
          code: "OAUTH_FAILED",
          message: "Failed to exchange Google auth code",
        },
      });
    }

    // Get user info
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    const profile = await userRes.json();
    if (!profile.email) {
      return reply.status(400).send({
        error: {
          code: "OAUTH_FAILED",
          message: "Could not get email from Google",
        },
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name || null,
          passwordHash: "", // OAuth users have no password
          emailVerified: true, // Google verified the email
        },
      });
    } else if (!user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    const token = app.jwt.sign(
      { sub: user.id, role: user.role },
      { expiresIn: "7d" },
    );
    return reply.send({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  },
);
```

**Step 4: tsc + tests + commit**

---

### Task 4: GitHub OAuth Backend

**Files:**

- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/config.ts`

**Step 1: Add config vars**

```typescript
githubClientId: process.env.GITHUB_CLIENT_ID || "",
githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
```

**Step 2: Add GitHub OAuth callback endpoint**

Same pattern as Google but with GitHub endpoints:

- Token exchange: `https://github.com/login/oauth/access_token`
- User info: `https://api.github.com/user`
- Email: `https://api.github.com/user/emails` (may need separate call for private emails)

**Step 3: tsc + tests + commit**

---

### Task 5: Social Login Buttons on Auth Page

**Files:**

- Modify: `apps/web/src/app/[locale]/auth/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/messages/en.json` (+ 6 locales)
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Add OAuth API functions**

```typescript
export async function oauthGoogleCallback(code: string, redirectUri: string) {
  return apiFetch<AuthResponse>("/api/v1/auth/oauth/google/callback", {
    method: "POST",
    body: JSON.stringify({ code, redirectUri }),
  });
}

export async function oauthGithubCallback(code: string) {
  return apiFetch<AuthResponse>("/api/v1/auth/oauth/github/callback", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
```

**Step 2: Add social login buttons to auth page**

Below the form, add a divider and two buttons:

```tsx
<div className="auth-divider">
  <span>{t("orContinueWith")}</span>
</div>
<div className="flex-col gap-2">
  <button onClick={handleGoogleLogin} className="btn btn-secondary p-3 flex items-center justify-center gap-2">
    <GoogleIcon /> {t("continueGoogle")}
  </button>
  <button onClick={handleGithubLogin} className="btn btn-secondary p-3 flex items-center justify-center gap-2">
    <GithubIcon /> {t("continueGithub")}
  </button>
</div>
```

**Step 3: Implement OAuth redirect flow**

Google: Redirect to `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=email profile`

GitHub: Redirect to `https://github.com/login/oauth/authorize?client_id=...&scope=user:email`

**Step 4: Create callback handler page** at `apps/web/src/app/[locale]/auth/callback/page.tsx` that reads the `code` query param and calls the backend.

**Step 5: Add CSS + i18n keys + commit**

---

## Execution Notes

- Tasks 1-2 are email verification (sequential — backend first, then frontend)
- Tasks 3-5 are OAuth (sequential — backend endpoints, then frontend buttons)
- Each task ends with five-step audit: tsc → tests → build → commit → push
- OAuth requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
- OAuth will gracefully degrade — buttons hidden if env vars not set
