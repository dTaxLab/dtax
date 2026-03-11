"use client";

import { useTranslations } from "next-intl";

const CODE_BLOCK_STYLE: React.CSSProperties = {
  background: "var(--bg-surface)",
  padding: "16px 20px",
  borderRadius: 8,
  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: 13,
  lineHeight: 1.7,
  overflowX: "auto",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

const ENV_VARS = [
  { name: "DATABASE_URL", required: true, key: "envDatabase" },
  { name: "JWT_SECRET", required: true, key: "envJwt" },
  { name: "ENCRYPTION_KEY", required: true, key: "envEncryption" },
  { name: "COINGECKO_API_KEY", required: false, key: "envCoingecko" },
] as const;

const TROUBLESHOOTING = [
  { key: "portConflict", icon: "🔌" },
  { key: "dbConnection", icon: "🗄️" },
  { key: "migration", icon: "🔄" },
] as const;

export default function DocsPage() {
  const t = useTranslations("docs");

  return (
    <div className="animate-in" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", padding: "48px 24px 32px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
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

      {/* Prerequisites */}
      <section style={{ padding: "0 16px 32px" }}>
        <div className="card" style={{ padding: 24, borderRadius: 12 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            {t("prereqTitle")}
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              color: "var(--text-secondary)",
              lineHeight: 1.8,
              fontSize: 14,
            }}
          >
            <li>{t("prereqDocker")}</li>
            <li>{t("prereqRam")}</li>
            <li>{t("prereqPostgres")}</li>
          </ul>
        </div>
      </section>

      {/* Quick Start */}
      <section style={{ padding: "0 16px 32px" }}>
        <div className="card" style={{ padding: 24, borderRadius: 12 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            {t("quickStartTitle")}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            {t("quickStartDesc")}
          </p>
          <pre style={CODE_BLOCK_STYLE}>
            <code>{`# 1. ${t("stepClone")}
git clone https://github.com/Phosmax/dtax.git
cd dtax

# 2. ${t("stepEnv")}
cp .env.example .env
# ${t("stepEnvEdit")}

# 3. ${t("stepStart")}
docker-compose up -d

# 4. ${t("stepAccess")}
# http://localhost:3000`}</code>
          </pre>
        </div>
      </section>

      {/* Environment Variables */}
      <section style={{ padding: "0 16px 32px" }}>
        <div className="card" style={{ padding: 24, borderRadius: 12 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            {t("envTitle")}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "2px solid var(--border)",
                    textAlign: "left",
                  }}
                >
                  <th
                    style={{
                      padding: "8px 12px",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                    }}
                  >
                    {t("envVarName")}
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                    }}
                  >
                    {t("envVarRequired")}
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                    }}
                  >
                    {t("envVarDesc")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ENV_VARS.map(({ name, required, key }) => (
                  <tr
                    key={name}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "8px 12px" }}>
                      <code
                        style={{
                          fontFamily:
                            "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                          fontSize: 13,
                          background: "var(--bg-surface)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          color: "var(--accent)",
                        }}
                      >
                        {name}
                      </code>
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: required
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      }}
                    >
                      {required ? t("envRequired") : t("envOptional")}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {t(key)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Architecture Overview */}
      <section style={{ padding: "0 16px 32px" }}>
        <div className="card" style={{ padding: 24, borderRadius: 12 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            {t("archTitle")}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            {t("archDesc")}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {(["api", "web", "db"] as const).map((svc) => (
              <div
                key={svc}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>
                  {svc === "api" ? "⚡" : svc === "web" ? "🌐" : "🐘"}
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    fontSize: 14,
                  }}
                >
                  {t(`arch${svc.charAt(0).toUpperCase() + svc.slice(1)}Name`)}
                </div>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {t(`arch${svc.charAt(0).toUpperCase() + svc.slice(1)}Port`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Updating */}
      <section style={{ padding: "0 16px 32px" }}>
        <div className="card" style={{ padding: 24, borderRadius: 12 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            {t("updateTitle")}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            {t("updateDesc")}
          </p>
          <pre style={CODE_BLOCK_STYLE}>
            <code>{`docker-compose pull
docker-compose up -d`}</code>
          </pre>
        </div>
      </section>

      {/* Troubleshooting */}
      <section style={{ padding: "0 16px 32px" }}>
        <div className="card" style={{ padding: 24, borderRadius: 12 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            {t("troubleTitle")}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {TROUBLESHOOTING.map(({ key, icon }) => (
              <div key={key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <h3
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {t(
                      `trouble${key.charAt(0).toUpperCase() + key.slice(1)}Title`,
                    )}
                  </h3>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    margin: "4px 0 0 26px",
                    lineHeight: 1.6,
                  }}
                >
                  {t(
                    `trouble${key.charAt(0).toUpperCase() + key.slice(1)}Body`,
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* License Note */}
      <section style={{ padding: "0 16px 32px" }}>
        <div
          className="card"
          style={{
            padding: 24,
            borderRadius: 12,
            borderLeft: "4px solid var(--accent)",
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            {t("licenseTitle")}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: 1.7,
            }}
          >
            {t("licenseBody")}
          </p>
        </div>
      </section>

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
          href="https://github.com/Phosmax/dtax"
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
