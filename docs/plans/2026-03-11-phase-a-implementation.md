# Phase A: P0 核心页面实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现上线阻塞的 4 项 P0 核心功能：法律页面、AuthGuard 公共路径、新用户引导向导、营销导航。

**Architecture:** 所有新页面在现有 Next.js App Router 内实现。AuthGuard 重构为白名单模式，允许公共页面无需登录访问。引导向导用 localStorage 跟踪完成状态，首次登录时自动触发。

**Tech Stack:** Next.js 14 App Router, next-intl, React, CSS variables

---

### Task A1: 法律页面 — 服务条款 + 隐私政策 + 税务免责声明

**Files:**

- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Create: `apps/web/src/app/[locale]/legal/terms/page.tsx`
- Create: `apps/web/src/app/[locale]/legal/privacy/page.tsx`
- Create: `apps/web/src/app/[locale]/legal/disclaimer/page.tsx`

**Step 1: 添加 i18n 消息**

在 `en.json` 和 `zh.json` 中添加 `"legal"` 键块（放在 `"landing"` 后）。

EN 消息：

```json
"legal": {
  "termsTitle": "Terms of Service",
  "termsLastUpdated": "Last updated: March 2026",
  "termsIntro": "By using DTax, you agree to these terms. DTax is a cryptocurrency tax calculation tool provided as-is.",
  "termsServiceTitle": "1. Service Description",
  "termsServiceBody": "DTax provides cryptocurrency tax calculation tools including capital gains computation, Form 8949 generation, and Schedule D summaries. DTax is a calculation tool only and does not constitute tax, legal, or financial advice. You should consult a qualified tax professional for your specific situation.",
  "termsUserTitle": "2. User Responsibilities",
  "termsUserBody": "You are responsible for the accuracy of all transaction data you input. DTax does not verify, validate, or audit your transaction data. You are solely responsible for your tax filings and any consequences thereof.",
  "termsDisclaimerTitle": "3. Disclaimer of Warranties",
  "termsDisclaimerBody": "DTax is provided \"as is\" without warranties of any kind. We do not guarantee the accuracy, completeness, or reliability of any tax calculations. Tax laws are complex and subject to change. DTax calculations are for informational purposes only.",
  "termsIpTitle": "4. Intellectual Property",
  "termsIpBody": "The DTax core engine is licensed under AGPL-3.0. The web application and API are provided under a commercial license. See our GitHub repository for full license details.",
  "termsTerminationTitle": "5. Account Termination",
  "termsTerminationBody": "We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account and all associated data at any time.",
  "termsDataTitle": "6. Data Handling",
  "termsDataBody": "Your data is handled in accordance with our Privacy Policy. We do not sell or share your financial data with third parties.",
  "termsChangesTitle": "7. Changes to Terms",
  "termsChangesBody": "We may update these terms from time to time. Continued use of DTax after changes constitutes acceptance of the new terms.",
  "privacyTitle": "Privacy Policy",
  "privacyLastUpdated": "Last updated: March 2026",
  "privacyIntro": "DTax is committed to protecting your privacy. This policy explains what data we collect and how we use it.",
  "privacyCollectTitle": "1. Data We Collect",
  "privacyCollectBody": "Email address (for account creation), cryptocurrency transaction data (uploaded by you), usage logs (page visits, feature usage), and preferences (theme, currency, tax method).",
  "privacyNotCollectTitle": "2. Data We Do NOT Collect",
  "privacyNotCollectBody": "Private keys, wallet passwords, social security numbers, bank account information, or any data beyond what you explicitly provide.",
  "privacyUseTitle": "3. How We Use Your Data",
  "privacyUseBody": "Your data is used solely to provide tax calculation services. We do not use your data for advertising, do not sell it to third parties, and do not share it with anyone.",
  "privacyStorageTitle": "4. Data Storage & Security",
  "privacyStorageBody": "All data is encrypted at rest and in transit. API keys are encrypted with AES-256. Authentication uses JWT tokens with bcrypt password hashing. You may delete your account and all data at any time.",
  "privacySelfHostTitle": "5. Self-Hosted Deployments",
  "privacySelfHostBody": "If you self-host DTax, your data never touches our servers. You have full control over storage, backups, and deletion. This privacy policy applies only to the hosted SaaS version.",
  "privacyThirdPartyTitle": "6. Third-Party Services",
  "privacyThirdPartyBody": "DTax uses CoinGecko API for cryptocurrency price data only. No user information or transaction data is sent to CoinGecko or any other third party.",
  "privacyCookieTitle": "7. Cookies",
  "privacyCookieBody": "DTax uses only functional cookies (JWT authentication token and theme preference stored in localStorage). We do not use tracking cookies, analytics cookies, or advertising cookies.",
  "privacyRightsTitle": "8. Your Rights",
  "privacyRightsBody": "You have the right to: export all your data, delete your account and all associated data, correct any inaccurate information, and request information about what data we hold.",
  "disclaimerTitle": "Tax Disclaimer",
  "disclaimerLastUpdated": "Last updated: March 2026",
  "disclaimerIntro": "Important information about DTax tax calculations.",
  "disclaimerNotAdviceTitle": "Not Tax Advice",
  "disclaimerNotAdviceBody": "DTax is a tax calculation tool, not a tax advisory service. The calculations, reports, and information provided by DTax are for informational purposes only and do not constitute tax, legal, or financial advice.",
  "disclaimerConsultTitle": "Consult a Professional",
  "disclaimerConsultBody": "Cryptocurrency taxation is complex and varies by jurisdiction. You should consult a qualified tax professional (CPA, tax attorney, or enrolled agent) for advice specific to your situation.",
  "disclaimerAccuracyTitle": "No Guarantee of Accuracy",
  "disclaimerAccuracyBody": "While DTax strives for accuracy, we cannot guarantee that all calculations are correct. Tax laws change frequently, exchange data may be incomplete, and edge cases may not be fully handled. You are responsible for verifying all calculations before filing.",
  "disclaimerLiabilityTitle": "Limitation of Liability",
  "disclaimerLiabilityBody": "DTax and its creators shall not be liable for any penalties, interest, additional taxes, or other consequences arising from the use of our calculations. By using DTax, you acknowledge and accept this limitation.",
  "disclaimerIrsTitle": "IRS Compliance",
  "disclaimerIrsBody": "DTax implements FIFO and Specific Identification methods as recognized by the IRS. However, IRS rules are subject to interpretation and change. DTax supports Form 8949 and Schedule D formats but is not endorsed by or affiliated with the IRS.",
  "backToHome": "← Back to Home"
}
```

ZH 消息：

```json
"legal": {
  "termsTitle": "服务条款",
  "termsLastUpdated": "最后更新：2026 年 3 月",
  "termsIntro": "使用 DTax 即表示您同意以下条款。DTax 是一个按原样提供的加密货币税务计算工具。",
  "termsServiceTitle": "1. 服务描述",
  "termsServiceBody": "DTax 提供加密货币税务计算工具，包括资本利得计算、Form 8949 生成和 Schedule D 汇总。DTax 仅是计算工具，不构成税务、法律或财务建议。您应就具体情况咨询专业税务顾问。",
  "termsUserTitle": "2. 用户责任",
  "termsUserBody": "您对输入的所有交易数据的准确性负责。DTax 不验证、不审核您的交易数据。您对自己的税务申报及其后果承担全部责任。",
  "termsDisclaimerTitle": "3. 免责声明",
  "termsDisclaimerBody": "DTax 按「原样」提供，不附带任何形式的保证。我们不保证任何税务计算的准确性、完整性或可靠性。税法复杂且可能变更。DTax 的计算仅供参考。",
  "termsIpTitle": "4. 知识产权",
  "termsIpBody": "DTax 核心引擎基于 AGPL-3.0 许可证开源。Web 应用和 API 采用商业许可证。详见 GitHub 仓库的完整许可证信息。",
  "termsTerminationTitle": "5. 账户终止",
  "termsTerminationBody": "我们保留暂停或终止违反条款的账户的权利。您可以随时删除账户及所有关联数据。",
  "termsDataTitle": "6. 数据处理",
  "termsDataBody": "您的数据按隐私政策处理。我们不向第三方出售或共享您的财务数据。",
  "termsChangesTitle": "7. 条款变更",
  "termsChangesBody": "我们可能不时更新这些条款。变更后继续使用 DTax 即表示接受新条款。",
  "privacyTitle": "隐私政策",
  "privacyLastUpdated": "最后更新：2026 年 3 月",
  "privacyIntro": "DTax 致力于保护您的隐私。本政策说明我们收集哪些数据以及如何使用。",
  "privacyCollectTitle": "1. 我们收集的数据",
  "privacyCollectBody": "电子邮箱（用于账户创建）、加密货币交易数据（由您上传）、使用日志（页面访问、功能使用）以及偏好设置（主题、货币、计税方法）。",
  "privacyNotCollectTitle": "2. 我们不收集的数据",
  "privacyNotCollectBody": "私钥、钱包密码、社会安全号码、银行账户信息，以及您明确提供之外的任何数据。",
  "privacyUseTitle": "3. 数据用途",
  "privacyUseBody": "您的数据仅用于提供税务计算服务。我们不将数据用于广告，不向第三方出售，不与任何人共享。",
  "privacyStorageTitle": "4. 数据存储与安全",
  "privacyStorageBody": "所有数据在存储和传输中均加密。API 密钥使用 AES-256 加密。认证使用 JWT 令牌和 bcrypt 密码哈希。您可以随时删除账户和所有数据。",
  "privacySelfHostTitle": "5. 自托管部署",
  "privacySelfHostBody": "如果您自托管 DTax，您的数据永远不会经过我们的服务器。您对存储、备份和删除拥有完全控制权。本隐私政策仅适用于托管 SaaS 版本。",
  "privacyThirdPartyTitle": "6. 第三方服务",
  "privacyThirdPartyBody": "DTax 使用 CoinGecko API 仅获取加密货币价格数据。不会向 CoinGecko 或任何其他第三方发送用户信息或交易数据。",
  "privacyCookieTitle": "7. Cookie",
  "privacyCookieBody": "DTax 仅使用功能性 Cookie（localStorage 中的 JWT 认证令牌和主题偏好）。我们不使用追踪 Cookie、分析 Cookie 或广告 Cookie。",
  "privacyRightsTitle": "8. 您的权利",
  "privacyRightsBody": "您有权：导出所有数据、删除账户及所有关联数据、更正不准确的信息、以及查询我们持有的数据。",
  "disclaimerTitle": "税务免责声明",
  "disclaimerLastUpdated": "最后更新：2026 年 3 月",
  "disclaimerIntro": "关于 DTax 税务计算的重要信息。",
  "disclaimerNotAdviceTitle": "非税务建议",
  "disclaimerNotAdviceBody": "DTax 是税务计算工具，而非税务咨询服务。DTax 提供的计算、报告和信息仅供参考，不构成税务、法律或财务建议。",
  "disclaimerConsultTitle": "咨询专业人士",
  "disclaimerConsultBody": "加密货币税务复杂且因司法管辖区而异。您应就具体情况咨询专业税务人士（注册会计师、税务律师或注册代理人）。",
  "disclaimerAccuracyTitle": "不保证准确性",
  "disclaimerAccuracyBody": "尽管 DTax 力求准确，但我们无法保证所有计算均正确。税法频繁变更，交易所数据可能不完整，边缘情况可能未完全处理。您有责任在申报前验证所有计算。",
  "disclaimerLiabilityTitle": "责任限制",
  "disclaimerLiabilityBody": "DTax 及其创建者不对因使用我们的计算而产生的任何罚款、利息、额外税款或其他后果承担责任。使用 DTax 即表示您知悉并接受此限制。",
  "disclaimerIrsTitle": "IRS 合规",
  "disclaimerIrsBody": "DTax 实现了 IRS 认可的 FIFO 和特定识别方法。但 IRS 规则可能存在解释差异和变更。DTax 支持 Form 8949 和 Schedule D 格式，但不受 IRS 认可或隶属于 IRS。",
  "backToHome": "← 返回首页"
}
```

**Step 2: 创建法律页面共享布局组件**

三个法律页面结构相同（标题 + 章节列表 + 返回链接），提取共享布局：

文件 `apps/web/src/app/[locale]/legal/legal-page.tsx`：

```tsx
"use client";

import { useTranslations } from "next-intl";

type Section = { title: string; body: string };

export function LegalPage({
  titleKey,
  updatedKey,
  introKey,
  sections,
}: {
  titleKey: string;
  updatedKey: string;
  introKey: string;
  sections: Section[];
}) {
  const t = useTranslations("legal");

  return (
    <div className="animate-in" style={{ maxWidth: "720px", margin: "0 auto" }}>
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 800,
          marginBottom: "8px",
          color: "var(--text-primary)",
        }}
      >
        {t(titleKey as Parameters<typeof t>[0])}
      </h1>
      <p
        style={{
          fontSize: "13px",
          color: "var(--text-muted)",
          marginBottom: "24px",
        }}
      >
        {t(updatedKey as Parameters<typeof t>[0])}
      </p>
      <p
        style={{
          fontSize: "15px",
          color: "var(--text-secondary)",
          marginBottom: "32px",
          lineHeight: 1.7,
        }}
      >
        {t(introKey as Parameters<typeof t>[0])}
      </p>
      {sections.map((s) => (
        <section key={s.title} style={{ marginBottom: "28px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "8px",
              color: "var(--text-primary)",
            }}
          >
            {t(s.title as Parameters<typeof t>[0])}
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              lineHeight: 1.7,
            }}
          >
            {t(s.body as Parameters<typeof t>[0])}
          </p>
        </section>
      ))}
      <div
        style={{
          marginTop: "40px",
          paddingTop: "20px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <a
          href="/"
          style={{
            color: "var(--accent)",
            textDecoration: "none",
            fontSize: "14px",
          }}
        >
          {t("backToHome")}
        </a>
      </div>
    </div>
  );
}
```

**Step 3: 创建三个法律页面**

`apps/web/src/app/[locale]/legal/terms/page.tsx`：

```tsx
"use client";
import { LegalPage } from "../legal-page";

const SECTIONS = [
  { title: "termsServiceTitle", body: "termsServiceBody" },
  { title: "termsUserTitle", body: "termsUserBody" },
  { title: "termsDisclaimerTitle", body: "termsDisclaimerBody" },
  { title: "termsIpTitle", body: "termsIpBody" },
  { title: "termsTerminationTitle", body: "termsTerminationBody" },
  { title: "termsDataTitle", body: "termsDataBody" },
  { title: "termsChangesTitle", body: "termsChangesBody" },
];

export default function TermsPage() {
  return (
    <LegalPage
      titleKey="termsTitle"
      updatedKey="termsLastUpdated"
      introKey="termsIntro"
      sections={SECTIONS}
    />
  );
}
```

`apps/web/src/app/[locale]/legal/privacy/page.tsx`：

```tsx
"use client";
import { LegalPage } from "../legal-page";

const SECTIONS = [
  { title: "privacyCollectTitle", body: "privacyCollectBody" },
  { title: "privacyNotCollectTitle", body: "privacyNotCollectBody" },
  { title: "privacyUseTitle", body: "privacyUseBody" },
  { title: "privacyStorageTitle", body: "privacyStorageBody" },
  { title: "privacySelfHostTitle", body: "privacySelfHostBody" },
  { title: "privacyThirdPartyTitle", body: "privacyThirdPartyBody" },
  { title: "privacyCookieTitle", body: "privacyCookieBody" },
  { title: "privacyRightsTitle", body: "privacyRightsBody" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      titleKey="privacyTitle"
      updatedKey="privacyLastUpdated"
      introKey="privacyIntro"
      sections={SECTIONS}
    />
  );
}
```

`apps/web/src/app/[locale]/legal/disclaimer/page.tsx`：

```tsx
"use client";
import { LegalPage } from "../legal-page";

const SECTIONS = [
  { title: "disclaimerNotAdviceTitle", body: "disclaimerNotAdviceBody" },
  { title: "disclaimerConsultTitle", body: "disclaimerConsultBody" },
  { title: "disclaimerAccuracyTitle", body: "disclaimerAccuracyBody" },
  { title: "disclaimerLiabilityTitle", body: "disclaimerLiabilityBody" },
  { title: "disclaimerIrsTitle", body: "disclaimerIrsBody" },
];

export default function DisclaimerPage() {
  return (
    <LegalPage
      titleKey="disclaimerTitle"
      updatedKey="disclaimerLastUpdated"
      introKey="disclaimerIntro"
      sections={SECTIONS}
    />
  );
}
```

**Step 4: 验证**

```bash
cd /Users/ericw/project/dtax && pnpm --filter @dtax/web exec tsc --noEmit
pnpm --filter @dtax/web build
```

---

### Task A2: AuthGuard 公共路径白名单重构

**Files:**

- Modify: `apps/web/src/app/[locale]/auth-guard.tsx`

**Step 1: 重构为白名单模式**

替换当前的 `segments.length <= 1` 检查为 `PUBLIC_PATHS` 白名单：

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";

const PUBLIC_PATHS = [
  "/auth",
  "/legal",
  "/pricing",
  "/features",
  "/security",
  "/exchanges",
  "/docs",
  "/for-cpas",
  "/faq",
  "/onboarding",
];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const tc = useTranslations("common");

  // 公共页面不需要守卫：根路径 + PUBLIC_PATHS
  const segments = pathname.split("/").filter(Boolean);
  const subPath = "/" + (segments[1] || "");
  if (segments.length <= 1 || PUBLIC_PATHS.some((p) => subPath.startsWith(p))) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="loading-pulse" style={{ fontSize: "48px" }}>
          🧮
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "16px" }}>
          {tc("loading")}
        </p>
      </div>
    );
  }

  if (!user) {
    const AuthPage = require("./auth/page").default;
    return <AuthPage />;
  }

  return <>{children}</>;
}
```

**Step 2: 验证**

```bash
pnpm --filter @dtax/web exec tsc --noEmit && pnpm --filter @dtax/web build
```

---

### Task A3: 新用户引导向导

**Files:**

- Modify: `apps/web/messages/en.json` — 添加 `"onboarding"` 键块
- Modify: `apps/web/messages/zh.json` — 添加 `"onboarding"` 键块
- Create: `apps/web/src/app/[locale]/onboarding/page.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx` — 首次登录检测并跳转

**Step 1: 添加 i18n 消息**

EN:

```json
"onboarding": {
  "welcome": "Welcome to DTax!",
  "welcomeSubtitle": "Let's set up your crypto tax calculation in a few steps.",
  "step": "Step {current} of {total}",
  "skip": "Skip setup →",
  "next": "Next",
  "back": "Back",
  "done": "Go to Dashboard",
  "roleTitle": "What describes you best?",
  "roleIndividual": "Individual Investor",
  "roleIndividualDesc": "I hold crypto and need to file taxes",
  "roleTrader": "Active Trader / DeFi User",
  "roleTraderDesc": "I trade across multiple exchanges and protocols",
  "roleCpa": "Tax Professional / CPA",
  "roleCpaDesc": "I manage tax filings for clients",
  "exchangeTitle": "Which exchanges do you use?",
  "exchangeSubtitle": "Select all that apply. You can change this later.",
  "exchangeOther": "Other / Not Listed",
  "importTitle": "Import your transactions",
  "importSubtitle": "Choose how to get your data into DTax.",
  "importCsv": "Upload CSV File",
  "importCsvDesc": "Export from your exchange and upload here",
  "importApi": "Connect via API",
  "importApiDesc": "Read-only API key for automatic sync",
  "importLater": "I'll do this later",
  "importLaterDesc": "Skip to dashboard and import manually",
  "readyTitle": "You're all set!",
  "readySubtitle": "DTax is ready to calculate your crypto taxes.",
  "readyTip1": "Import transactions from your exchanges",
  "readyTip2": "Calculate taxes with FIFO, LIFO, or HIFO",
  "readyTip3": "Export Form 8949 and Schedule D reports"
}
```

ZH:

```json
"onboarding": {
  "welcome": "欢迎使用 DTax！",
  "welcomeSubtitle": "几步设置，开始你的加密税务计算。",
  "step": "步骤 {current} / {total}",
  "skip": "跳过设置 →",
  "next": "下一步",
  "back": "上一步",
  "done": "进入仪表盘",
  "roleTitle": "你的身份是？",
  "roleIndividual": "个人投资者",
  "roleIndividualDesc": "持有加密货币，需要报税",
  "roleTrader": "活跃交易者 / DeFi 用户",
  "roleTraderDesc": "在多个交易所和协议上交易",
  "roleCpa": "税务专业人士 / CPA",
  "roleCpaDesc": "为客户管理税务申报",
  "exchangeTitle": "你使用哪些交易所？",
  "exchangeSubtitle": "可多选，后续可修改。",
  "exchangeOther": "其他 / 未列出",
  "importTitle": "导入你的交易记录",
  "importSubtitle": "选择将数据导入 DTax 的方式。",
  "importCsv": "上传 CSV 文件",
  "importCsvDesc": "从交易所导出后上传",
  "importApi": "通过 API 连接",
  "importApiDesc": "只读 API 密钥自动同步",
  "importLater": "稍后再说",
  "importLaterDesc": "跳到仪表盘，手动导入",
  "readyTitle": "一切就绪！",
  "readySubtitle": "DTax 已准备好计算你的加密税务。",
  "readyTip1": "从交易所导入交易记录",
  "readyTip2": "使用 FIFO、LIFO 或 HIFO 计算税务",
  "readyTip3": "导出 Form 8949 和 Schedule D 报告"
}
```

**Step 2: 创建引导向导页面**

`apps/web/src/app/[locale]/onboarding/page.tsx`：

4 步向导组件，使用 `useState` 管理步骤和选择：

- Step 1: 角色选择（个人/交易者/CPA）
- Step 2: 交易所多选（17 个交易所 pill 标签）
- Step 3: 导入方式选择（CSV/API/稍后）— 选 CSV/API 则跳转到对应页面
- Step 4: 完成页（3 个提示 + 进入 Dashboard 按钮）

完成时写入 `localStorage.setItem("dtax_onboarding_completed", "true")`。

"跳过设置" 按钮在所有步骤可见，点击直接标记完成并跳转 Dashboard。

**Step 3: 修改 Dashboard 页面**

在 `page.tsx` 的 Dashboard 组件中，数据加载完成后检测：

```typescript
// 已登录且首次使用（无交易且未完成引导）→ 跳转引导
useEffect(() => {
  if (user && !loading && txMeta.total === 0) {
    const done = localStorage.getItem("dtax_onboarding_completed");
    if (!done) {
      window.location.href = "onboarding";
    }
  }
}, [user, loading, txMeta.total]);
```

**Step 4: 验证**

```bash
pnpm --filter @dtax/web exec tsc --noEmit && pnpm --filter @dtax/web build
```

---

### Task A4: Nav 升级 — 未登录营销导航

**Files:**

- Modify: `apps/web/messages/en.json` — 在 `"nav"` 中添加营销链接键
- Modify: `apps/web/messages/zh.json` — 在 `"nav"` 中添加营销链接键
- Modify: `apps/web/src/app/[locale]/nav.tsx`
- Modify: `apps/web/src/app/[locale]/landing.tsx` — 添加 Landing Page 页脚法律链接

**Step 1: 添加 Nav i18n 消息**

在 `nav` 键块中追加：

```json
"features": "Features",
"pricing": "Pricing",
"docs": "Docs",
"signIn": "Sign In"
```

ZH:

```json
"features": "功能",
"pricing": "定价",
"docs": "文档",
"signIn": "登录"
```

**Step 2: 修改 Nav 组件**

在 `nav.tsx` 中，未登录时的导航从单个 "Sign In" 链接改为完整的营销导航：

```tsx
{user ? (
  // 已有的 8 个应用链接
) : (
  <>
    <Link href="/features" className="nav-link" onClick={() => setMenuOpen(false)}>
      {t("features")}
    </Link>
    <Link href="/pricing" className="nav-link" onClick={() => setMenuOpen(false)}>
      {t("pricing")}
    </Link>
    <Link href="/legal/terms" className="nav-link" onClick={() => setMenuOpen(false)}>
      {t("docs")}
    </Link>
    <Link
      href="/auth"
      className="nav-link"
      style={{ fontWeight: 600, color: "var(--accent)" }}
      onClick={() => setMenuOpen(false)}
    >
      {t("signIn")}
    </Link>
  </>
)}
```

注意：`/features` 和 `/pricing` 页面在 Phase B 实现，暂时链接到这些路径（AuthGuard 已放行但页面还未创建，会显示 404 — 这在 Task A2 中 PUBLIC_PATHS 已包含这些路径）。

如果觉得 404 不可接受，可以暂时将 features 链接改为 Landing Page 的 anchor `/#features`，pricing 改为 `/#pricing`。但 Next.js App Router 不支持 hash 路由滚动，所以更好的做法是先只显示存在的页面链接（legal/terms + auth），Phase B 完成后再添加 features/pricing。

**推荐方案：** Nav 未登录时只显示已存在的链接 + Sign In：

```tsx
// 未登录营销导航 — 仅链接已实现的页面
const marketingLinks = [{ href: "/legal/terms", label: t("docs") }];
```

Phase B 完成后追加 features、pricing、security。

**Step 3: Landing Page 页脚添加法律链接**

在 `landing.tsx` 的 Bottom CTA section 下方添加法律链接行：

```tsx
{
  /* Legal Links */
}
<div
  style={{
    textAlign: "center",
    padding: "24px 0",
    fontSize: "13px",
    color: "var(--text-muted)",
  }}
>
  <a
    href="legal/terms"
    style={{ color: "var(--text-muted)", textDecoration: "none" }}
  >
    Terms
  </a>
  {" · "}
  <a
    href="legal/privacy"
    style={{ color: "var(--text-muted)", textDecoration: "none" }}
  >
    Privacy
  </a>
  {" · "}
  <a
    href="legal/disclaimer"
    style={{ color: "var(--text-muted)", textDecoration: "none" }}
  >
    Tax Disclaimer
  </a>
</div>;
```

**Step 4: 验证**

```bash
pnpm --filter @dtax/web exec tsc --noEmit && pnpm --filter @dtax/web build
pnpm test
```
