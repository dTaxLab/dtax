"use client";

import { useTranslations } from "next-intl";

type PlanFeature = {
  key: string;
  free: boolean | string;
  pro: boolean | string;
  cpa: boolean | string;
};

const FEATURE_COMPARISON: PlanFeature[] = [
  {
    key: "featureTxLimit",
    free: "feature50Tx",
    pro: "featureUnlimited",
    cpa: "featureUnlimited",
  },
  {
    key: "featureCostBasis",
    free: "featureFifoOnly",
    pro: "featureAllMethods",
    cpa: "featureAllMethods",
  },
  { key: "featureCsvExport", free: true, pro: true, cpa: true },
  { key: "featureForm8949Pdf", free: false, pro: true, cpa: true },
  { key: "featureWashSale", free: false, pro: true, cpa: true },
  { key: "featureScheduleD", free: false, pro: true, cpa: true },
  { key: "feature1099da", free: false, pro: true, cpa: true },
  { key: "featureMultiClient", free: false, pro: false, cpa: true },
  { key: "featureWhiteLabel", free: false, pro: false, cpa: true },
  { key: "featureBulkImport", free: false, pro: false, cpa: true },
  { key: "featurePrioritySupport", free: false, pro: true, cpa: true },
  { key: "featureDedicatedSupport", free: false, pro: false, cpa: true },
];

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_KEYS: FaqItem[] = [
  { question: "faq1Q", answer: "faq1A" },
  { question: "faq2Q", answer: "faq2A" },
  { question: "faq3Q", answer: "faq3A" },
  { question: "faq4Q", answer: "faq4A" },
];

export default function PricingPage() {
  const t = useTranslations("pricing");

  function renderCell(val: boolean | string) {
    if (val === true)
      return (
        <span style={{ color: "var(--green)", fontSize: "18px" }}>
          &#10003;
        </span>
      );
    if (val === false)
      return (
        <span style={{ color: "var(--text-muted)", fontSize: "18px" }}>
          &#10007;
        </span>
      );
    return (
      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
        {t(val as Parameters<typeof t>[0])}
      </span>
    );
  }

  return (
    <div className="animate-in">
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "80px 0 48px" }}>
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: "16px",
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
            maxWidth: "600px",
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          {t("heroSubtitle")}
        </p>
      </section>

      {/* Pricing Cards */}
      <section style={{ padding: "0 0 64px" }}>
        <div className="grid-3">
          {/* Free Plan */}
          <div
            className="card"
            style={{
              padding: "32px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h3
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "8px",
              }}
            >
              {t("freeTitle")}
            </h3>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 800,
                color: "var(--accent)",
                marginBottom: "4px",
              }}
            >
              $0
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "24px",
              }}
            >
              {t("freeDesc")}
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 24px",
                textAlign: "left",
                flex: 1,
              }}
            >
              {(
                ["freeF1", "freeF2", "freeF3", "freeF4", "freeF5"] as const
              ).map((key) => (
                <li
                  key={key}
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
                  {t(key as Parameters<typeof t>[0])}
                </li>
              ))}
            </ul>
            <a
              href="auth"
              className="btn btn-secondary"
              style={{
                textDecoration: "none",
                width: "100%",
                display: "block",
              }}
            >
              {t("freeCta")}
            </a>
          </div>

          {/* Pro Plan — highlighted */}
          <div
            className="card"
            style={{
              padding: "32px 24px",
              textAlign: "center",
              border: "2px solid var(--accent)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "-12px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--accent)",
                color: "white",
                fontSize: "11px",
                fontWeight: 700,
                padding: "4px 16px",
                borderRadius: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {t("mostPopular")}
            </span>
            <h3
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "8px",
              }}
            >
              {t("proTitle")}
            </h3>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 800,
                color: "var(--accent)",
                marginBottom: "4px",
              }}
            >
              $49
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "24px",
              }}
            >
              {t("proDesc")}
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 24px",
                textAlign: "left",
                flex: 1,
              }}
            >
              {(
                ["proF1", "proF2", "proF3", "proF4", "proF5", "proF6"] as const
              ).map((key) => (
                <li
                  key={key}
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
                  {t(key as Parameters<typeof t>[0])}
                </li>
              ))}
            </ul>
            <a
              href="auth"
              className="btn btn-primary"
              style={{
                textDecoration: "none",
                width: "100%",
                display: "block",
              }}
            >
              {t("proCta")}
            </a>
          </div>

          {/* CPA Plan */}
          <div
            className="card"
            style={{
              padding: "32px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h3
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "8px",
              }}
            >
              {t("cpaTitle")}
            </h3>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 800,
                color: "var(--accent)",
                marginBottom: "4px",
              }}
            >
              $199
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "24px",
              }}
            >
              {t("cpaDesc")}
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 24px",
                textAlign: "left",
                flex: 1,
              }}
            >
              {(["cpaF1", "cpaF2", "cpaF3", "cpaF4", "cpaF5"] as const).map(
                (key) => (
                  <li
                    key={key}
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
                    {t(key as Parameters<typeof t>[0])}
                  </li>
                ),
              )}
            </ul>
            <a
              href="mailto:hello@dtax.ai"
              className="btn btn-secondary"
              style={{
                textDecoration: "none",
                width: "100%",
                display: "block",
              }}
            >
              {t("cpaCta")}
            </a>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section style={{ padding: "0 0 64px" }}>
        <h2
          style={{
            fontSize: "24px",
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
                <th style={{ textAlign: "center" }}>{t("freeTitle")}</th>
                <th style={{ textAlign: "center", color: "var(--accent)" }}>
                  {t("proTitle")}
                </th>
                <th style={{ textAlign: "center" }}>{t("cpaTitle")}</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_COMPARISON.map((row) => (
                <tr key={row.key}>
                  <td>{t(row.key as Parameters<typeof t>[0])}</td>
                  <td style={{ textAlign: "center" }}>
                    {renderCell(row.free)}
                  </td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.pro)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.cpa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Open Source Callout */}
      <section style={{ padding: "0 0 64px" }}>
        <div
          className="card"
          style={{
            padding: "32px",
            textAlign: "center",
            border: "1px dashed var(--accent)",
            background: "var(--bg-surface)",
          }}
        >
          <h3
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "12px",
            }}
          >
            {t("ossTitle")}
          </h3>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              maxWidth: "520px",
              margin: "0 auto 20px",
              lineHeight: 1.7,
            }}
          >
            {t("ossBody")}
          </p>
          <a
            href="https://github.com/dTaxLab/dtax"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            {t("ossBtn")}
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "0 0 64px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "24px",
            textAlign: "center",
            color: "var(--text-primary)",
          }}
        >
          {t("faqTitle")}
        </h2>
        <div
          style={{
            maxWidth: "680px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {FAQ_KEYS.map((faq) => (
            <div
              key={faq.question}
              className="card"
              style={{ padding: "20px 24px" }}
            >
              <h4
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "8px",
                }}
              >
                {t(faq.question as Parameters<typeof t>[0])}
              </h4>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {t(faq.answer as Parameters<typeof t>[0])}
              </p>
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
          {t("bottomCta")}
        </h2>
        <p
          style={{
            fontSize: "15px",
            color: "var(--text-secondary)",
            marginBottom: "24px",
          }}
        >
          {t("bottomCtaSub")}
        </p>
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
          {t("bottomCtaBtn")}
        </a>
      </section>
    </div>
  );
}
