"use client";

import { useTranslations } from "next-intl";

type FeatureSection = {
  icon: string;
  titleKey: string;
  descKey: string;
  bulletKeys: string[];
};

const FEATURES: FeatureSection[] = [
  {
    icon: "\uD83E\uDDEE",
    titleKey: "taxEngineTitle",
    descKey: "taxEngineDesc",
    bulletKeys: [
      "taxEngineBullet1",
      "taxEngineBullet2",
      "taxEngineBullet3",
      "taxEngineBullet4",
    ],
  },
  {
    icon: "\uD83D\uDD04",
    titleKey: "exchangeTitle",
    descKey: "exchangeDesc",
    bulletKeys: [
      "exchangeBullet1",
      "exchangeBullet2",
      "exchangeBullet3",
      "exchangeBullet4",
    ],
  },
  {
    icon: "\uD83D\uDD17",
    titleKey: "defiTitle",
    descKey: "defiDesc",
    bulletKeys: ["defiBullet1", "defiBullet2", "defiBullet3", "defiBullet4"],
  },
  {
    icon: "\uD83D\uDCC8",
    titleKey: "portfolioTitle",
    descKey: "portfolioDesc",
    bulletKeys: [
      "portfolioBullet1",
      "portfolioBullet2",
      "portfolioBullet3",
      "portfolioBullet4",
    ],
  },
  {
    icon: "\uD83D\uDD12",
    titleKey: "securityTitle",
    descKey: "securityDesc",
    bulletKeys: [
      "securityBullet1",
      "securityBullet2",
      "securityBullet3",
      "securityBullet4",
    ],
  },
  {
    icon: "\uD83D\uDCC4",
    titleKey: "reportsTitle",
    descKey: "reportsDesc",
    bulletKeys: [
      "reportsBullet1",
      "reportsBullet2",
      "reportsBullet3",
      "reportsBullet4",
    ],
  },
];

export default function FeaturesPage() {
  const t = useTranslations("features");

  return (
    <div className="animate-in">
      {/* Header */}
      <section style={{ textAlign: "center", padding: "60px 0 48px" }}>
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
          {t("pageTitle")}
        </h1>
        <p
          style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            color: "var(--text-secondary)",
            maxWidth: "600px",
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          {t("pageSubtitle")}
        </p>
      </section>

      {/* Feature Cards — 2-column grid */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "24px",
          padding: "0 0 48px",
        }}
      >
        {FEATURES.map((feature) => (
          <div
            key={feature.titleKey}
            className="card"
            style={{ padding: "32px 28px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontSize: "32px", lineHeight: 1 }}>
                {feature.icon}
              </span>
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {t(feature.titleKey as Parameters<typeof t>[0])}
              </h2>
            </div>
            <p
              style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                marginBottom: "16px",
              }}
            >
              {t(feature.descKey as Parameters<typeof t>[0])}
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {feature.bulletKeys.map((bk) => (
                <li
                  key={bk}
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    padding: "5px 0",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    style={{
                      color: "var(--green)",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  >
                    &#10003;
                  </span>
                  {t(bk as Parameters<typeof t>[0])}
                </li>
              ))}
            </ul>
          </div>
        ))}
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
          {t("ctaTitle")}
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
          {t("ctaButton")}
        </a>
      </section>
    </div>
  );
}
