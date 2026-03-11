"use client";

import { useTranslations } from "next-intl";

const EXCHANGES = [
  "Coinbase",
  "Binance",
  "Kraken",
  "Gemini",
  "Crypto.com",
  "KuCoin",
  "OKX",
  "Bybit",
  "Gate.io",
  "Bitget",
  "MEXC",
  "HTX",
  "Bitfinex",
  "Poloniex",
  "Etherscan",
  "Solscan",
  "Generic CSV",
];

type ComparisonRow = {
  key: string;
  dtax: boolean | string;
  koinly: boolean | string;
  cointracker: boolean | string;
};

const COMPARISON: ComparisonRow[] = [
  {
    key: "comparisonOpenSource",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  {
    key: "comparisonSelfHost",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  { key: "comparisonDefi", dtax: true, koinly: true, cointracker: true },
  { key: "comparisonNft", dtax: true, koinly: true, cointracker: false },
  {
    key: "comparisonDefiParsers",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  { key: "comparisonWashSale", dtax: true, koinly: true, cointracker: true },
  { key: "comparisonForm8949", dtax: true, koinly: true, cointracker: true },
  {
    key: "comparison1099da",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  {
    key: "comparisonSpecificId",
    dtax: true,
    koinly: false,
    cointracker: false,
  },
  {
    key: "comparisonExchanges",
    dtax: "20",
    koinly: "400+",
    cointracker: "300+",
  },
  {
    key: "comparisonPrice",
    dtax: "comparisonFree",
    koinly: "$49",
    cointracker: "$59",
  },
];

type PricingPlan = {
  title: string;
  price: string;
  desc: string;
  cta: string;
  href: string;
  highlight: boolean;
  features: string[];
};

const PRICING_PLANS: PricingPlan[] = [
  {
    title: "pricingFreeTitle",
    price: "pricingFreePrice",
    desc: "pricingFreeDesc",
    cta: "pricingFreeCta",
    href: "auth",
    highlight: false,
    features: [
      "pricingFreeF1",
      "pricingFreeF2",
      "pricingFreeF3",
      "pricingFreeF4",
      "pricingFreeF5",
    ],
  },
  {
    title: "pricingProTitle",
    price: "pricingProPrice",
    desc: "pricingProDesc",
    cta: "pricingProCta",
    href: "auth",
    highlight: true,
    features: [
      "pricingProF1",
      "pricingProF2",
      "pricingProF3",
      "pricingProF4",
      "pricingProF5",
    ],
  },
  {
    title: "pricingCpaTitle",
    price: "pricingCpaPrice",
    desc: "pricingCpaDesc",
    cta: "pricingCpaCta",
    href: "mailto:hello@dtax.ai",
    highlight: false,
    features: [
      "pricingCpaF1",
      "pricingCpaF2",
      "pricingCpaF3",
      "pricingCpaF4",
      "pricingCpaF5",
    ],
  },
];

export function LandingPage() {
  const t = useTranslations("landing");

  function renderCell(val: boolean | string, isPrice: boolean) {
    if (val === true)
      return <span style={{ color: "var(--green)" }}>&#10003;</span>;
    if (val === false)
      return <span style={{ color: "var(--text-muted)" }}>&#10007;</span>;
    if (isPrice && val === "comparisonFree")
      return (
        <span style={{ color: "var(--green)", fontWeight: 600 }}>
          {t("comparisonFree")}
        </span>
      );
    return <span>{val}</span>;
  }

  return (
    <div className="animate-in">
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "80px 0 48px" }}>
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: "20px",
            background: "linear-gradient(135deg, var(--accent), #a78bfa)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {t("heroTitle")}
        </h1>
        <p
          style={{
            fontSize: "clamp(16px, 2.5vw, 20px)",
            color: "var(--text-secondary)",
            maxWidth: "640px",
            margin: "0 auto 32px",
            lineHeight: 1.6,
          }}
        >
          {t("heroSubtitle")}
        </p>
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="auth"
            className="btn btn-primary"
            style={{
              textDecoration: "none",
              padding: "14px 32px",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            {t("ctaGetStarted")}
          </a>
          <a
            href="https://github.com/Phosmax/dtax"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{
              textDecoration: "none",
              padding: "14px 32px",
              fontSize: "16px",
            }}
          >
            {t("ctaGitHub")}
          </a>
        </div>
      </section>

      {/* Trust Bar */}
      <section
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "32px",
          flexWrap: "wrap",
          padding: "24px 0 48px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {(
          [
            "trustGithub",
            "trustTests",
            "trustLicense",
            "trustExchanges",
          ] as const
        ).map((key) => (
          <span
            key={key}
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span style={{ color: "var(--green)", fontSize: "16px" }}>
              &#10003;
            </span>
            {t(key)}
          </span>
        ))}
      </section>

      {/* 3 Core Features */}
      <section style={{ padding: "48px 0" }}>
        <div className="grid-3">
          {(
            [
              {
                title: "featureOpenSourceTitle",
                desc: "featureOpenSourceDesc",
                icon: "\uD83D\uDD0D",
              },
              {
                title: "featureDefiTitle",
                desc: "featureDefiDesc",
                icon: "\uD83D\uDD17",
              },
              {
                title: "featureSelfHostTitle",
                desc: "featureSelfHostDesc",
                icon: "\uD83C\uDFE0",
              },
            ] as const
          ).map((f) => (
            <div
              key={f.title}
              className="card"
              style={{ padding: "32px 24px", textAlign: "center" }}
            >
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>
                {f.icon}
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "8px",
                  color: "var(--text-primary)",
                }}
              >
                {t(f.title)}
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {t(f.desc)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Exchange Coverage */}
      <section style={{ padding: "32px 0 48px", textAlign: "center" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "24px",
            color: "var(--text-primary)",
          }}
        >
          {t("exchangesCovered")}
        </h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            justifyContent: "center",
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
          {EXCHANGES.map((name) => (
            <span
              key={name}
              style={{
                padding: "6px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 500,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section style={{ padding: "32px 0 48px" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "24px",
            textAlign: "center",
            color: "var(--text-primary)",
          }}
        >
          {t("comparisonTitle")}
        </h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t("comparisonFeature")}</th>
                <th style={{ textAlign: "center", color: "var(--accent)" }}>
                  DTax
                </th>
                <th style={{ textAlign: "center" }}>Koinly</th>
                <th style={{ textAlign: "center" }}>CoinTracker</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => {
                const isPrice = row.key === "comparisonPrice";
                return (
                  <tr key={row.key}>
                    <td>{t(row.key as Parameters<typeof t>[0])}</td>
                    <td style={{ textAlign: "center" }}>
                      {renderCell(row.dtax, isPrice)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {renderCell(row.koinly, isPrice)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {renderCell(row.cointracker, isPrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: "32px 0 48px" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "32px",
            textAlign: "center",
            color: "var(--text-primary)",
          }}
        >
          {t("pricingTitle")}
        </h2>
        <div className="grid-3">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.title}
              className="card"
              style={{
                padding: "32px 24px",
                textAlign: "center",
                border: plan.highlight ? "2px solid var(--accent)" : undefined,
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "8px",
                }}
              >
                {t(plan.title as Parameters<typeof t>[0])}
              </h3>
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  color: "var(--accent)",
                  marginBottom: "8px",
                }}
              >
                {t(plan.price as Parameters<typeof t>[0])}
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "24px",
                }}
              >
                {t(plan.desc as Parameters<typeof t>[0])}
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 24px",
                  textAlign: "left",
                }}
              >
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      padding: "6px 0",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span style={{ color: "var(--green)", flexShrink: 0 }}>
                      &#10003;
                    </span>
                    {t(f as Parameters<typeof t>[0])}
                  </li>
                ))}
              </ul>
              <a
                href={plan.href}
                className={
                  plan.highlight ? "btn btn-primary" : "btn btn-secondary"
                }
                style={{
                  textDecoration: "none",
                  width: "100%",
                  display: "block",
                }}
              >
                {t(plan.cta as Parameters<typeof t>[0])}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        style={{
          textAlign: "center",
          padding: "48px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "16px",
            color: "var(--text-primary)",
          }}
        >
          {t("footerCta")}
        </h2>
        <a
          href="auth"
          className="btn btn-primary"
          style={{
            textDecoration: "none",
            padding: "14px 40px",
            fontSize: "16px",
            fontWeight: 600,
          }}
        >
          {t("footerCtaBtn")}
        </a>
      </section>

      {/* Legal Footer */}
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
          {t("footerTerms")}
        </a>
        {" · "}
        <a
          href="legal/privacy"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          {t("footerPrivacy")}
        </a>
        {" · "}
        <a
          href="legal/disclaimer"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          {t("footerDisclaimer")}
        </a>
      </div>
    </div>
  );
}
