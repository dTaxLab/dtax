"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const CATEGORIES = [
  {
    key: "gettingStarted",
    icon: "🚀",
    questions: ["whatIsDtax", "isFree", "howImport", "exchanges"],
  },
  {
    key: "taxCalculation",
    icon: "🧮",
    questions: ["fifoLifoHifo", "washSale", "form8949ScheduleD", "defiNft"],
  },
  {
    key: "privacySecurity",
    icon: "🔒",
    questions: ["dataSafe", "accessFunds", "openSource"],
  },
  {
    key: "professional",
    icon: "💼",
    questions: ["cpaUse", "selfHost", "irsCompliant", "turbotax"],
  },
] as const;

export default function FaqPage() {
  const t = useTranslations("faq");
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (id: string) => {
    setOpen((prev) => (prev === id ? null : id));
  };

  return (
    <div className="animate-in" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", padding: "48px 24px 32px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❓</div>
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

      {/* Categories */}
      <div style={{ padding: "0 16px 48px" }}>
        {CATEGORIES.map(({ key, icon, questions }) => (
          <div key={key} style={{ marginBottom: 32 }}>
            {/* Category header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 24 }}>{icon}</span>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {t(`${key}Title`)}
              </h2>
            </div>

            {/* Questions */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {questions.map((qKey) => {
                const id = `${key}.${qKey}`;
                const isOpen = open === id;
                return (
                  <div
                    key={id}
                    className="card"
                    style={{
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => toggle(id)}
                      aria-expanded={isOpen}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "14px 18px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        color: "var(--text-primary)",
                        fontSize: 15,
                        fontWeight: 500,
                        lineHeight: 1.4,
                        gap: 12,
                      }}
                    >
                      <span>{t(`${qKey}Q`)}</span>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 18,
                          transition: "transform 0.2s ease",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                          color: "var(--text-muted)",
                        }}
                      >
                        ▾
                      </span>
                    </button>
                    <div
                      style={{
                        maxHeight: isOpen ? 500 : 0,
                        overflow: "hidden",
                        transition: "max-height 0.3s ease",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          padding: "0 18px 16px",
                          fontSize: 14,
                          lineHeight: 1.7,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {t(`${qKey}A`)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
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
          {t("ctaText")}
        </p>
        <a
          href="https://github.com/Phosmax/dtax/issues"
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
