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
