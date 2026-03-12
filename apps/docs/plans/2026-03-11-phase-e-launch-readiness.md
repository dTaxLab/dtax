# Phase E: 上线硬门槛 — Launch Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 解决阻止 DTax 正式上线的 5 个关键缺失项，使产品达到可对外发布的最低标准。

**Architecture:**

- 邮件服务采用 Resend（免费额度 3000 封/月，API 简洁）
- 密码重置使用 crypto.randomBytes 生成一次性令牌，15 分钟过期
- 安全头通过 Next.js middleware 注入，不依赖外部服务
- SEO 通过 Next.js App Router 原生 sitemap.ts/robots.ts/metadata API 实现

**Tech Stack:** Resend (email), Next.js Metadata API, crypto (Node built-in), Sentry (@sentry/nextjs + @sentry/node)

---

## Task E1: 邮件服务 + 邮箱验证

### E1-1: Prisma Schema 扩展

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

**Step 1: 添加 User 邮箱验证字段 + PasswordReset 模型**

在 User model 的 `role` 字段后添加：

```prisma
emailVerified Boolean  @default(false) @map("email_verified")
```

在 Subscription model 后添加新模型：

```prisma
// ─── Password Reset Token ────────────────────
model PasswordReset {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
  @@map("password_resets")
}
```

注意：User model 需要添加 relation：`passwordResets PasswordReset[]`

**Step 2: 生成 migration**

Run: `cd apps/api && npx prisma migrate dev --name add_email_verification`
Expected: Migration SQL 文件生成，包含 ALTER TABLE + CREATE TABLE

**Step 3: 验证 Prisma client 类型更新**

Run: `cd apps/api && npx prisma generate`
Expected: Prisma Client generated

**Step 4: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(schema): add emailVerified field and PasswordReset model"
```

---

### E1-2: Resend 邮件服务集成

**Files:**

- Create: `apps/api/src/lib/email.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/package.json` (add resend dependency)

**Step 1: 安装 Resend**

Run: `cd apps/api && pnpm add resend`

**Step 2: 扩展 config.ts**

在 config 对象中添加：

```typescript
resendApiKey: process.env.RESEND_API_KEY || "",
appUrl: process.env.APP_URL || "http://localhost:3000",
fromEmail: process.env.FROM_EMAIL || "noreply@dtax.ai",
```

**Step 3: 创建 email.ts**

```typescript
/**
 * 邮件发送服务
 * 使用 Resend API 发送验证邮件和密码重置邮件。
 * 开发环境无 API key 时仅打印到控制台。
 */

import { Resend } from "resend";
import { config } from "../config";

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<void> {
  if (!resend) {
    // 开发环境：打印到控制台
    console.log(
      `\n📧 EMAIL (dev mode)\nTo: ${to}\nSubject: ${subject}\n${html}\n`,
    );
    return;
  }

  await resend.emails.send({
    from: config.fromEmail,
    to,
    subject,
    html,
  });
}

export function verificationEmail(verifyUrl: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "Verify your DTax account",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Welcome to DTax</h2>
        <p>Click the link below to verify your email address:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">
          Verify Email
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
      </div>
    `,
  };
}

export function resetPasswordEmail(resetUrl: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "Reset your DTax password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  };
}
```

**Step 4: 验证 tsc**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```bash
git add apps/api/src/lib/email.ts apps/api/src/config.ts apps/api/package.json apps/api/pnpm-lock.yaml
git commit -m "feat(api): add Resend email service with dev console fallback"
```

---

### E1-3: 邮箱验证路由

**Files:**

- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/plugins/auth.ts` (添加 verify-email 到公共路由)

**Step 1: 写失败测试**

在 `apps/api/src/__tests__/auth.test.ts` 添加：

```typescript
describe("POST /auth/verify-email", () => {
  it("验证有效 token 设置 emailVerified=true", async () => {
    // Mock: findFirst returns valid token, user update succeeds
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      emailVerified: false,
    } as any);
    mockPrisma.user.update.mockResolvedValueOnce({
      id: "u1",
      emailVerified: true,
    } as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/verify-email?token=valid-token&userId=u1",
    });
    expect(res.statusCode).toBe(200);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `pnpm --filter api test -- --grep "verify-email"`
Expected: FAIL (route not defined)

**Step 3: 实现路由**

在 `auth.ts` 的 `authRoutes` 函数中添加：

注册路由修改：注册后生成 verification token (crypto.randomBytes)，通过 JWT 编码发送验证链接。

```typescript
import crypto from "crypto";
import { sendEmail, verificationEmail } from "../lib/email";
import { config } from "../config";
```

在 register 成功后（创建用户之后、返回之前）添加邮件发送逻辑：

```typescript
// 发送验证邮件（异步不阻塞响应）
const verifyToken = crypto.randomBytes(32).toString("hex");
// 使用 JWT 编码 token+userId，24h 过期
const verifyJwt = app.jwt.sign(
  { sub: user.id, purpose: "email-verify", token: verifyToken },
  { expiresIn: "24h" },
);
const verifyUrl = `${config.appUrl}/auth/verify?token=${verifyJwt}`;
const email = verificationEmail(verifyUrl);
sendEmail({ to: user.email, ...email }).catch((err) =>
  request.log.error(err, "Failed to send verification email"),
);
```

新增 GET 路由：

```typescript
// GET /auth/verify-email — 验证邮箱
app.get("/auth/verify-email", async (request, reply) => {
  const query = z.object({ token: z.string() }).parse(request.query);

  try {
    const decoded = app.jwt.verify(query.token) as {
      sub: string;
      purpose: string;
    };
    if (decoded.purpose !== "email-verify") {
      return reply.status(400).send({
        error: { code: "INVALID_TOKEN", message: "Invalid verification token" },
      });
    }

    await prisma.user.update({
      where: { id: decoded.sub },
      data: { emailVerified: true },
    });

    return { data: { verified: true } };
  } catch {
    return reply.status(400).send({
      error: { code: "INVALID_TOKEN", message: "Token expired or invalid" },
    });
  }
});
```

**Step 4: 添加 verify-email 到公共路由白名单**

在 `plugins/auth.ts` 的公共路由判断中添加：

```typescript
url.startsWith("/api/v1/auth/verify-email");
```

**Step 5: 运行测试确认通过**

Run: `pnpm --filter api test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/plugins/auth.ts apps/api/src/__tests__/auth.test.ts
git commit -m "feat(auth): add email verification with JWT-encoded token"
```

---

### E1-4: 前端验证邮箱页面

**Files:**

- Create: `apps/web/src/app/[locale]/auth/verify/page.tsx`
- Modify: `apps/web/messages/en.json` (添加 auth.verify\* keys)
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/src/app/[locale]/auth-guard.tsx` (添加 /auth/verify 到 PUBLIC_PATHS)

**Step 1: 添加 i18n keys**

en.json auth 块添加：

```json
"verifyTitle": "Verify Your Email",
"verifySuccess": "Email verified successfully! You can now sign in.",
"verifyFailed": "Verification failed. The link may have expired.",
"verifyChecking": "Verifying your email...",
"verificationSent": "We've sent a verification email to {email}. Please check your inbox.",
"resendVerification": "Resend Verification Email"
```

zh.json auth 块添加：

```json
"verifyTitle": "验证邮箱",
"verifySuccess": "邮箱验证成功！您现在可以登录了。",
"verifyFailed": "验证失败。链接可能已过期。",
"verifyChecking": "正在验证您的邮箱...",
"verificationSent": "我们已向 {email} 发送了验证邮件，请查收。",
"resendVerification": "重新发送验证邮件"
```

**Step 2: 创建验证页面**

`apps/web/src/app/[locale]/auth/verify/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function VerifyEmailPage() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    fetch(`${API}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => setStatus(r.ok ? "success" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div
      className="container animate-in"
      style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1rem" }}
    >
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
          {t("verifyTitle")}
        </h1>
        {status === "loading" && <p>{t("verifyChecking")}</p>}
        {status === "success" && (
          <>
            <p style={{ color: "var(--color-success)", marginBottom: "1rem" }}>
              {t("verifySuccess")}
            </p>
            <Link href="/auth" className="btn btn-primary">
              {t("loginBtn")}
            </Link>
          </>
        )}
        {status === "error" && (
          <p style={{ color: "#ef4444" }}>{t("verifyFailed")}</p>
        )}
      </div>
    </div>
  );
}
```

**Step 3: 验证 next build**

Run: `pnpm --filter web exec next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/auth/verify/ apps/web/messages/ apps/web/src/app/[locale]/auth-guard.tsx
git commit -m "feat(web): add email verification page with i18n"
```

---

## Task E2: 密码重置

### E2-1: 密码重置 API 路由

**Files:**

- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/plugins/auth.ts` (添加公共路由)
- Modify: `apps/api/src/__tests__/auth.test.ts`

**Step 1: 写失败测试**

```typescript
describe("POST /auth/forgot-password", () => {
  it("发送重置邮件", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
    } as any);
    mockPrisma.passwordReset.create.mockResolvedValueOnce({} as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "a@b.com" },
    });
    // 无论邮箱是否存在，都返回 200（防止邮箱枚举）
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /auth/reset-password", () => {
  it("使用有效 token 重置密码", async () => {
    mockPrisma.passwordReset.findUnique.mockResolvedValueOnce({
      id: "pr1",
      userId: "u1",
      token: "abc",
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null,
    } as any);
    mockPrisma.passwordReset.update.mockResolvedValueOnce({} as any);
    mockPrisma.user.update.mockResolvedValueOnce({} as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token: "abc", password: "newpass123" },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

**Step 2: 运行测试确认失败**

Run: `pnpm --filter api test -- --grep "forgot-password|reset-password"`
Expected: FAIL

**Step 3: 实现路由**

在 `auth.ts` 添加两个新端点：

```typescript
// POST /auth/forgot-password — 请求密码重置（速率限制：每分钟 3 次）
app.post(
  "/auth/forgot-password",
  { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
  async (request) => {
    const { email } = z
      .object({ email: z.string().email() })
      .parse(request.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 分钟
        },
      });

      const resetUrl = `${config.appUrl}/auth/reset?token=${token}`;
      const mail = resetPasswordEmail(resetUrl);
      sendEmail({ to: email, ...mail }).catch((err) =>
        request.log.error(err, "Failed to send reset email"),
      );
    }

    // 无论邮箱是否存在都返回成功（防止邮箱枚举攻击）
    return {
      data: { message: "If this email exists, a reset link has been sent." },
    };
  },
);

// POST /auth/reset-password — 重置密码
app.post("/auth/reset-password", async (request, reply) => {
  const body = z
    .object({
      token: z.string(),
      password: z.string().min(8),
    })
    .parse(request.body);

  const reset = await prisma.passwordReset.findUnique({
    where: { token: body.token },
  });

  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return reply.status(400).send({
      error: {
        code: "INVALID_TOKEN",
        message: "Token expired or already used",
      },
    });
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  await Promise.all([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { data: { message: "Password reset successful" } };
});
```

**Step 4: 添加公共路由白名单**

在 `plugins/auth.ts` 添加：

```typescript
url.startsWith("/api/v1/auth/forgot-password") ||
url.startsWith("/api/v1/auth/reset-password") ||
```

**Step 5: 运行全部测试**

Run: `pnpm --filter api test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/plugins/auth.ts apps/api/src/__tests__/auth.test.ts
git commit -m "feat(auth): add forgot-password and reset-password endpoints"
```

---

### E2-2: 前端密码重置页面

**Files:**

- Create: `apps/web/src/app/[locale]/auth/reset/page.tsx`
- Modify: `apps/web/src/app/[locale]/auth/page.tsx` (添加 "Forgot password?" 链接)
- Modify: `apps/web/messages/en.json` (添加 auth.forgot*/reset* keys)
- Modify: `apps/web/messages/zh.json`

**Step 1: 添加 i18n keys**

en.json auth 块添加：

```json
"forgotPassword": "Forgot password?",
"forgotTitle": "Reset Password",
"forgotSubtitle": "Enter your email to receive a reset link",
"forgotSubmit": "Send Reset Link",
"forgotSuccess": "If this email is registered, you'll receive a reset link shortly.",
"resetTitle": "Set New Password",
"resetSubmit": "Reset Password",
"resetSuccess": "Password reset! You can now sign in with your new password.",
"resetInvalidToken": "Invalid or expired reset link."
```

zh.json 对应中文翻译。

**Step 2: 创建重置密码页面**

`apps/web/src/app/[locale]/auth/reset/page.tsx` — 两阶段：

1. 无 token 参数：显示邮箱输入表单 → POST /auth/forgot-password
2. 有 token 参数：显示新密码表单 → POST /auth/reset-password

**Step 3: 在登录表单添加 "Forgot password?" 链接**

在 `auth/page.tsx` 的登录表单密码框后添加：

```tsx
<Link href="/auth/reset" style={{ fontSize: "13px", color: "var(--accent)" }}>
  {t("forgotPassword")}
</Link>
```

**Step 4: 验证 next build**

Run: `pnpm --filter web exec next build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/auth/ apps/web/messages/
git commit -m "feat(web): add password reset UI with forgot password flow"
```

---

## Task E3: 安全响应头

### E3-1: Next.js Security Headers Middleware

**Files:**

- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/next.config.ts`

**Step 1: 在 next.config.ts 添加 security headers**

```typescript
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};
```

注意：不添加 CSP（Content-Security-Policy）因为它需要 nonce 配合 Next.js 的 inline scripts（theme blocking script 和 next-intl），复杂度高且容易破坏功能。X-Frame-Options + X-Content-Type-Options 已覆盖主要攻击向量。

HSTS 不在代码中添加，由反向代理（nginx/Cloudflare）配置更合适。

**Step 2: 在 API 添加安全头**

修改 `apps/api/src/index.ts`，在 CORS 注册后添加：

```typescript
// Security headers
app.addHook("onSend", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "1; mode=block");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
});
```

**Step 3: 验证 build**

Run: `pnpm --filter web exec next build && pnpm --filter api exec tsc --noEmit`
Expected: Both pass

**Step 4: Commit**

```bash
git add apps/web/next.config.ts apps/api/src/index.ts
git commit -m "feat: add security response headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)"
```

---

## Task E4: SEO 基础设施

### E4-1: robots.ts + sitemap.ts

**Files:**

- Create: `apps/web/src/app/robots.ts`
- Create: `apps/web/src/app/sitemap.ts`

**Step 1: 创建 robots.ts**

```typescript
import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/settings/",
          "/transactions/",
          "/tax/",
          "/portfolio/",
          "/reconcile/",
          "/compare/",
          "/transfers/",
        ],
      },
    ],
    sitemap: "https://dtax.ai/sitemap.xml",
  };
}
```

**Step 2: 创建 sitemap.ts**

```typescript
import { MetadataRoute } from "next";

const BASE_URL = "https://dtax.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ["en", "zh"];
  const publicPages = [
    "", // landing
    "/pricing",
    "/features",
    "/security",
    "/exchanges",
    "/faq",
    "/docs",
    "/docs/changelog",
    "/for-cpas",
    "/auth",
    "/legal/terms",
    "/legal/privacy",
    "/legal/disclaimer",
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const page of publicPages) {
    for (const locale of locales) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: page === "" ? "weekly" : "monthly",
        priority: page === "" ? 1.0 : page === "/pricing" ? 0.9 : 0.7,
      });
    }
  }

  return entries;
}
```

**Step 3: 验证 next build**

Run: `pnpm --filter web exec next build`
Expected: Build succeeds, /sitemap.xml and /robots.txt in output

**Step 4: Commit**

```bash
git add apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts
git commit -m "feat(seo): add robots.txt and sitemap.xml with all public pages"
```

---

### E4-2: Open Graph + JSON-LD 结构化数据

**Files:**

- Modify: `apps/web/src/app/[locale]/layout.tsx` (增强 metadata)
- Create: `apps/web/src/app/[locale]/json-ld.tsx` (JSON-LD 结构化数据)

**Step 1: 增强 layout.tsx metadata**

将 layout.tsx 的 metadata 替换为动态 generateMetadata：

```typescript
import type { Metadata } from "next";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === "zh";

  const title = "DTax — AI-Powered Crypto Tax Intelligence";
  const description = isZh
    ? "开源加密货币税务计算器，支持 FIFO、LIFO、HIFO。计算资本利得并生成税务报告。"
    : "Open source crypto tax calculator with FIFO, LIFO, HIFO support. Calculate capital gains and generate tax reports.";

  return {
    title,
    description,
    keywords: [
      "crypto",
      "tax",
      "bitcoin",
      "FIFO",
      "capital gains",
      "portfolio",
      "1099-DA",
      "Form 8949",
    ],
    metadataBase: new URL("https://dtax.ai"),
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", zh: "/zh" },
    },
    openGraph: {
      title,
      description,
      url: `https://dtax.ai/${locale}`,
      siteName: "DTax",
      locale: isZh ? "zh_CN" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
```

**Step 2: 添加 JSON-LD 组件**

`apps/web/src/app/[locale]/json-ld.tsx`:

```tsx
export function JsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DTax",
    description: "AI-Powered Crypto Tax Intelligence",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    aggregateRating: undefined, // Add when we have ratings
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
```

在 layout.tsx 的 `<head>` 中加入 `<JsonLd />`。

**Step 3: 验证 next build**

Run: `pnpm --filter web exec next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/layout.tsx apps/web/src/app/[locale]/json-ld.tsx
git commit -m "feat(seo): add Open Graph, Twitter Card, JSON-LD structured data"
```

---

## Task E5: Sentry 错误监控

### E5-1: API Sentry 集成

**Files:**

- Modify: `apps/api/package.json` (add @sentry/node)
- Create: `apps/api/src/lib/sentry.ts`
- Modify: `apps/api/src/index.ts` (集成 Sentry 到 error handler)

**Step 1: 安装 Sentry**

Run: `cd apps/api && pnpm add @sentry/node`

**Step 2: 创建 sentry.ts**

```typescript
/**
 * Sentry 错误监控初始化
 * 仅在 SENTRY_DSN 环境变量存在时启用。
 */

import * as Sentry from "@sentry/node";

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1, // 10% performance sampling
  });
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(error, { extra: context });
}
```

**Step 3: 集成到 error handler**

在 `index.ts` 的 `main()` 开头添加：

```typescript
import { initSentry, captureException } from "./lib/sentry";
initSentry();
```

在 error handler 的 `request.log.error(error)` 后添加：

```typescript
captureException(error, { url: request.url, method: request.method });
```

**Step 4: 验证 tsc**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```bash
git add apps/api/src/lib/sentry.ts apps/api/src/index.ts apps/api/package.json
git commit -m "feat(api): add Sentry error monitoring (opt-in via SENTRY_DSN)"
```

---

### E5-2: Web Sentry 集成

**Files:**

- Modify: `apps/web/package.json` (add @sentry/nextjs)
- Create: `apps/web/sentry.client.config.ts`
- Create: `apps/web/sentry.server.config.ts`
- Modify: `apps/web/next.config.ts` (wrap with withSentryConfig)
- Modify: `apps/web/src/app/global-error.tsx` (Sentry 错误边界)

**Step 1: 安装 Sentry**

Run: `cd apps/web && pnpm add @sentry/nextjs`

**Step 2: 创建 sentry.client.config.ts**

```typescript
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
  });
}
```

**Step 3: 创建 sentry.server.config.ts**

```typescript
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
```

**Step 4: 修改 next.config.ts**

```typescript
import { withSentryConfig } from "@sentry/nextjs";

// ... existing config ...

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

注意：如果 SENTRY_ORG/PROJECT 未设置，withSentryConfig 会 gracefully skip sourcemap 上传。

**Step 5: 验证 next build**

Run: `pnpm --filter web exec next build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add apps/web/sentry.client.config.ts apps/web/sentry.server.config.ts apps/web/next.config.ts apps/web/package.json apps/web/src/app/global-error.tsx
git commit -m "feat(web): add Sentry error monitoring with Next.js integration"
```

---

## 验证清单

完成所有任务后执行：

1. `pnpm --filter api exec tsc --noEmit` — API 类型检查
2. `pnpm --filter web exec tsc --noEmit` — Web 类型检查
3. `pnpm --filter api test` — API 全量测试
4. `pnpm --filter tax-engine test` — 引擎测试
5. `pnpm --filter cli test` — CLI 测试
6. `pnpm --filter web exec next build` — 前端构建
7. 检查 git log 确认所有提交

Run: `pnpm --filter api test && pnpm --filter tax-engine test && pnpm --filter cli test && pnpm --filter web exec next build`

Expected: 全部通过，758+ tests pass

---

## .env.example 更新

```env
# Email (Resend)
RESEND_API_KEY=           # Optional: Resend API key for sending emails
APP_URL=http://localhost:3000
FROM_EMAIL=noreply@dtax.ai

# Error Monitoring (Sentry)
SENTRY_DSN=               # Optional: Sentry DSN for error tracking
NEXT_PUBLIC_SENTRY_DSN=   # Optional: Sentry DSN for client-side
```
