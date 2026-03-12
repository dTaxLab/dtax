"use client";

import { useTranslations } from "next-intl";

const SECTIONS = [
  { key: "dataHandling", icon: "🗂️" },
  { key: "encryption", icon: "🔐" },
  { key: "architecture", icon: "🏗️" },
  { key: "selfHosting", icon: "🖥️" },
  { key: "authentication", icon: "🪪" },
  { key: "openSource", icon: "📖" },
  { key: "compliance", icon: "✅" },
] as const;

export default function SecurityPage() {
  const t = useTranslations("security");

  return (
    <div className="animate-in" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Hero */}
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px 32px",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🛡️</div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 12,
          }}
        >
          {t("heroTitle")}
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "var(--text-secondary)",
            maxWidth: 600,
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          {t("heroSubtitle")}
        </p>
      </div>

      {/* Security cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
          gap: 20,
          padding: "0 16px 40px",
        }}
      >
        {SECTIONS.map(({ key, icon }) => (
          <div
            key={key}
            className="card"
            style={{
              padding: 24,
              borderRadius: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 28 }}>{icon}</span>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {t(`${key}Title`)}
              </h2>
            </div>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              {t(`${key}Body`)}
            </p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          textAlign: "center",
          padding: "24px 16px 48px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            fontSize: 16,
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}
        >
          {t("ctaQuestion")}
        </p>
        <a
          href="https://github.com/dTaxLab/dtax/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{
            display: "inline-block",
            textDecoration: "none",
            padding: "10px 24px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {t("ctaButton")}
        </a>
      </div>
    </div>
  );
}
