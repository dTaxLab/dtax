"use client";

import { useTranslations } from "next-intl";

type ExchangeInfo = {
  name: string;
  tags: string[];
};

const MAJOR_EXCHANGES: ExchangeInfo[] = [
  { name: "Coinbase", tags: ["CSV"] },
  { name: "Binance", tags: ["CSV", "API"] },
  { name: "Kraken", tags: ["CSV", "API"] },
  { name: "Gemini", tags: ["CSV"] },
  { name: "Crypto.com", tags: ["CSV"] },
  { name: "KuCoin", tags: ["CSV", "API"] },
];

const GLOBAL_EXCHANGES: ExchangeInfo[] = [
  { name: "OKX", tags: ["CSV", "API"] },
  { name: "Bybit", tags: ["CSV", "API"] },
  { name: "Gate.io", tags: ["CSV", "API"] },
  { name: "Bitget", tags: ["CSV", "API"] },
  { name: "MEXC", tags: ["CSV", "API"] },
  { name: "HTX (Huobi)", tags: ["CSV", "API"] },
  { name: "Bitfinex", tags: ["CSV"] },
  { name: "Poloniex", tags: ["CSV"] },
];

const BLOCKCHAIN_EXPLORERS: ExchangeInfo[] = [
  { name: "Etherscan", tags: ["CSV", "DeFi"] },
  { name: "Etherscan Multi-chain", tags: ["CSV", "DeFi"] },
  { name: "Solscan", tags: ["CSV"] },
  { name: "Solscan DeFi", tags: ["CSV", "DeFi"] },
];

const UNIVERSAL: ExchangeInfo[] = [
  { name: "Generic CSV", tags: ["CSV"] },
  { name: "CCXT API", tags: ["API"] },
];

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  CSV: { bg: "var(--accent)", text: "#fff" },
  API: { bg: "#8b5cf6", text: "#fff" },
  DeFi: { bg: "#f59e0b", text: "#fff" },
};

function ExchangeCard({ exchange }: { exchange: ExchangeInfo }) {
  return (
    <div
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span
        style={{
          fontSize: "1.1rem",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {exchange.name}
      </span>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {exchange.tags.map((tag) => {
          const colors = TAG_COLORS[tag] || {
            bg: "var(--bg-surface)",
            text: "var(--text-secondary)",
          };
          return (
            <span
              key={tag}
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "2px 10px",
                borderRadius: "9999px",
                backgroundColor: colors.bg,
                color: colors.text,
                letterSpacing: "0.02em",
              }}
            >
              {tag}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function ExchangesPage() {
  const t = useTranslations("exchanges");

  const sections: {
    titleKey: string;
    descKey: string;
    exchanges: ExchangeInfo[];
  }[] = [
    {
      titleKey: "majorTitle",
      descKey: "majorDesc",
      exchanges: MAJOR_EXCHANGES,
    },
    {
      titleKey: "globalTitle",
      descKey: "globalDesc",
      exchanges: GLOBAL_EXCHANGES,
    },
    {
      titleKey: "blockchainTitle",
      descKey: "blockchainDesc",
      exchanges: BLOCKCHAIN_EXPLORERS,
    },
    {
      titleKey: "universalTitle",
      descKey: "universalDesc",
      exchanges: UNIVERSAL,
    },
  ];

  return (
    <div className="animate-in" style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Hero */}
      <div
        style={{
          textAlign: "center",
          padding: "48px 16px 32px",
        }}
      >
        <h1
          style={{
            fontSize: "2.4rem",
            fontWeight: 800,
            color: "var(--text-primary)",
            marginBottom: "12px",
          }}
        >
          {t("heroTitle")}
        </h1>
        <p
          style={{
            fontSize: "1.15rem",
            color: "var(--text-secondary)",
            maxWidth: 600,
            margin: "0 auto",
          }}
        >
          {t("heroSubtitle")}
        </p>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "36px",
          flexWrap: "wrap",
        }}
      >
        {Object.entries(TAG_COLORS).map(([tag, colors]) => (
          <div
            key={tag}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: colors.bg,
              }}
            />
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
              }}
            >
              {t(`legend${tag}`)}
            </span>
          </div>
        ))}
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.titleKey} style={{ marginBottom: "40px" }}>
          <h2
            style={{
              fontSize: "1.4rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "4px",
            }}
          >
            {t(section.titleKey)}
          </h2>
          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--text-muted)",
              marginBottom: "16px",
            }}
          >
            {t(section.descKey)}
          </p>
          <div className="grid-3" style={{ display: "grid", gap: "12px" }}>
            {section.exchanges.map((ex) => (
              <ExchangeCard key={ex.name} exchange={ex} />
            ))}
          </div>
        </div>
      ))}

      {/* CTA: Don't see your exchange? */}
      <div
        className="card"
        style={{
          textAlign: "center",
          padding: "32px 24px",
          marginBottom: "48px",
        }}
      >
        <h3
          style={{
            fontSize: "1.3rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "12px",
          }}
        >
          {t("missingTitle")}
        </h3>
        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: "8px",
            maxWidth: 560,
            margin: "0 auto 8px",
          }}
        >
          {t("missingGeneric")}
        </p>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "20px",
          }}
        >
          {t("missingRequest")}
        </p>
        <a
          href="https://github.com/dTaxLab/dtax/issues/new?labels=exchange-request&template=feature_request.yml"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{
            display: "inline-block",
            textDecoration: "none",
          }}
        >
          {t("requestBtn")}
        </a>
      </div>
    </div>
  );
}
