"use client";

import { useTranslations } from "next-intl";

type ChangelogEntry = {
  versionKey: string;
  dateKey: string;
  titleKey: string;
  descKey: string;
};

const ENTRIES: ChangelogEntry[] = [
  {
    versionKey: "v054",
    dateKey: "v054Date",
    titleKey: "v054Title",
    descKey: "v054Desc",
  },
  {
    versionKey: "v053",
    dateKey: "v053Date",
    titleKey: "v053Title",
    descKey: "v053Desc",
  },
  {
    versionKey: "v052",
    dateKey: "v052Date",
    titleKey: "v052Title",
    descKey: "v052Desc",
  },
  {
    versionKey: "v051",
    dateKey: "v051Date",
    titleKey: "v051Title",
    descKey: "v051Desc",
  },
  {
    versionKey: "v050",
    dateKey: "v050Date",
    titleKey: "v050Title",
    descKey: "v050Desc",
  },
  {
    versionKey: "v040",
    dateKey: "v040Date",
    titleKey: "v040Title",
    descKey: "v040Desc",
  },
  {
    versionKey: "v030",
    dateKey: "v030Date",
    titleKey: "v030Title",
    descKey: "v030Desc",
  },
  {
    versionKey: "v020",
    dateKey: "v020Date",
    titleKey: "v020Title",
    descKey: "v020Desc",
  },
  {
    versionKey: "v010",
    dateKey: "v010Date",
    titleKey: "v010Title",
    descKey: "v010Desc",
  },
  {
    versionKey: "v001",
    dateKey: "v001Date",
    titleKey: "v001Title",
    descKey: "v001Desc",
  },
];

export default function ChangelogPage() {
  const t = useTranslations("changelog");

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

      {/* Timeline */}
      <section
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "0 0 64px",
          position: "relative",
        }}
      >
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: "19px",
            top: "0",
            bottom: "0",
            width: "2px",
            background: "var(--border)",
          }}
        />

        {ENTRIES.map((entry, i) => (
          <div
            key={entry.versionKey}
            style={{
              display: "flex",
              gap: "24px",
              marginBottom: i < ENTRIES.length - 1 ? "32px" : "0",
              position: "relative",
            }}
          >
            {/* Timeline dot */}
            <div
              style={{
                width: "40px",
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
                paddingTop: "20px",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: i === 0 ? "var(--accent)" : "var(--border)",
                  border: "3px solid var(--bg-surface)",
                  zIndex: 1,
                }}
              />
            </div>

            {/* Card */}
            <div
              className="card"
              style={{
                flex: 1,
                padding: "20px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                  flexWrap: "wrap",
                }}
              >
                {/* Version badge */}
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "var(--accent)",
                    color: "#fff",
                    letterSpacing: "0.02em",
                  }}
                >
                  {t(entry.versionKey as Parameters<typeof t>[0])}
                </span>
                {/* Date */}
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                  }}
                >
                  {t(entry.dateKey as Parameters<typeof t>[0])}
                </span>
              </div>

              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: "0 0 6px",
                }}
              >
                {t(entry.titleKey as Parameters<typeof t>[0])}
              </h3>

              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {t(entry.descKey as Parameters<typeof t>[0])}
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
