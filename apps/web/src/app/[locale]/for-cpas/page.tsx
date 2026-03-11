"use client";

import { useTranslations } from "next-intl";

const PAIN_POINTS = [
  { key: "spreadsheets", icon: "\uD83D\uDCCA" },
  { key: "formats", icon: "\uD83D\uDD04" },
  { key: "complexity", icon: "\u2696\uFE0F" },
] as const;

const SOLUTION_FEATURES = [
  { key: "multiClient", icon: "\uD83D\uDC65" },
  { key: "exchanges", icon: "\uD83D\uDD17" },
  { key: "compliance", icon: "\uD83D\uDCCB" },
  { key: "bulk", icon: "\u26A1" },
] as const;

const STEPS = [
  { key: "step1", num: "1" },
  { key: "step2", num: "2" },
  { key: "step3", num: "3" },
] as const;

const TRUST_ITEMS = [
  { key: "openSource", icon: "\uD83D\uDD13" },
  { key: "irsCompliant", icon: "\u2705" },
  { key: "tested", icon: "\uD83E\uDDEA" },
  { key: "professionals", icon: "\uD83D\uDC68\u200D\uD83D\uDCBC" },
] as const;

export default function ForCpasPage() {
  const t = useTranslations("forCpas");

  return (
    <div className="animate-in" style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "60px 24px 48px" }}>
        <h1
          style={{
            fontSize: "clamp(28px, 4vw, 44px)",
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
            fontSize: "clamp(15px, 2vw, 18px)",
            color: "var(--text-secondary)",
            maxWidth: 640,
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          {t("heroSubtitle")}
        </p>
      </section>

      {/* Pain Points */}
      <section style={{ padding: "0 16px 48px" }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {t("painTitle")}
        </h2>
        <div className="grid-3">
          {PAIN_POINTS.map(({ key, icon }) => (
            <div
              key={key}
              className="card"
              style={{ padding: 24, textAlign: "center" }}
            >
              <span
                style={{ fontSize: 36, display: "block", marginBottom: 12 }}
              >
                {icon}
              </span>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {t(`pain_${key}` as Parameters<typeof t>[0])}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Solution Features */}
      <section style={{ padding: "0 16px 48px" }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {t("solutionTitle")}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 20,
          }}
        >
          {SOLUTION_FEATURES.map(({ key, icon }) => (
            <div key={key} className="card" style={{ padding: 24 }}>
              <span
                style={{ fontSize: 32, display: "block", marginBottom: 12 }}
              >
                {icon}
              </span>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {t(`solution_${key}_title` as Parameters<typeof t>[0])}
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {t(`solution_${key}_desc` as Parameters<typeof t>[0])}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section
        style={{
          padding: "48px 16px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          {t("howTitle")}
        </h2>
        <div className="grid-3">
          {STEPS.map(({ key, num }) => (
            <div
              key={key}
              style={{
                textAlign: "center",
                padding: "0 12px",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 16,
                }}
              >
                {num}
              </div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {t(`${key}_title` as Parameters<typeof t>[0])}
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {t(`${key}_desc` as Parameters<typeof t>[0])}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        style={{
          padding: "48px 16px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          {t("pricingTitle")}
        </h2>
        <p
          style={{
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: 14,
            marginBottom: 32,
          }}
        >
          {t("pricingSubtitle")}
        </p>
        <div
          className="card"
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: 32,
            textAlign: "center",
            border: "2px solid var(--accent)",
          }}
        >
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            {t("pricingPlan")}
          </h3>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "var(--accent)",
              margin: "12px 0 4px",
            }}
          >
            $199
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-muted)",
              marginBottom: 20,
            }}
          >
            {t("pricingPeriod")}
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 24px",
              textAlign: "left",
            }}
          >
            {(
              [
                "pricingF1",
                "pricingF2",
                "pricingF3",
                "pricingF4",
                "pricingF5",
              ] as const
            ).map((fk) => (
              <li
                key={fk}
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  padding: "6px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--green)", flexShrink: 0 }}>
                  &#10003;
                </span>
                {t(fk)}
              </li>
            ))}
          </ul>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontStyle: "italic",
              margin: 0,
            }}
          >
            {t("pricingCompare")}
          </p>
        </div>
      </section>

      {/* Trust Indicators */}
      <section
        style={{
          padding: "48px 16px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {t("trustTitle")}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {TRUST_ITEMS.map(({ key, icon }) => (
            <div
              key={key}
              style={{
                textAlign: "center",
                padding: 20,
                background: "var(--bg-surface)",
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>
                {icon}
              </span>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {t(`trust_${key}` as Parameters<typeof t>[0])}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        style={{
          textAlign: "center",
          padding: "48px 16px 64px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 24,
          }}
        >
          {t("ctaTitle")}
        </h2>
        <div
          style={{
            display: "flex",
            gap: 16,
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
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {t("ctaTrial")}
          </a>
          <a
            href="mailto:sales@dtax.ai"
            className="btn btn-secondary"
            style={{
              textDecoration: "none",
              padding: "14px 32px",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {t("ctaSales")}
          </a>
        </div>
      </section>
    </div>
  );
}
