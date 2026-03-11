"use client";

import { useState } from "react";
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
];

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<string | null>(null);
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>([]);

  function complete() {
    localStorage.setItem("dtax_onboarding_completed", "true");
    window.location.href = "./";
  }

  function skip() {
    complete();
  }

  function toggleExchange(name: string) {
    setSelectedExchanges((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    );
  }

  function goImport(mode: string) {
    localStorage.setItem("dtax_onboarding_completed", "true");
    if (mode === "csv") {
      window.location.href = "transactions";
    } else if (mode === "api") {
      window.location.href = "transactions";
    } else {
      setStep(4);
    }
  }

  return (
    <div
      className="animate-in"
      style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}
    >
      {/* Progress */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "32px",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          {t("step", { current: step, total: TOTAL_STEPS })}
        </span>
        <button
          onClick={skip}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: "13px",
          }}
        >
          {t("skip")}
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: "4px",
          background: "var(--bg-surface)",
          borderRadius: "2px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(step / TOTAL_STEPS) * 100}%`,
            background: "var(--accent)",
            borderRadius: "2px",
            transition: "width 0.3s",
          }}
        />
      </div>

      {/* Step 1: Role Selection */}
      {step === 1 && (
        <div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 800,
              marginBottom: "8px",
              color: "var(--text-primary)",
            }}
          >
            {t("welcome")}
          </h1>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary)",
              marginBottom: "24px",
            }}
          >
            {t("roleTitle")}
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {(
              [
                {
                  key: "individual",
                  label: "roleIndividual",
                  desc: "roleIndividualDesc",
                },
                {
                  key: "trader",
                  label: "roleTrader",
                  desc: "roleTraderDesc",
                },
                { key: "cpa", label: "roleCpa", desc: "roleCpaDesc" },
              ] as const
            ).map((r) => (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                className="card"
                style={{
                  padding: "16px 20px",
                  textAlign: "left",
                  cursor: "pointer",
                  background:
                    role === r.key ? "var(--bg-surface)" : "var(--bg-card)",
                  border:
                    role === r.key
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {t(r.label)}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    marginTop: "4px",
                  }}
                >
                  {t(r.desc)}
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: "24px", textAlign: "right" }}>
            <button
              className="btn btn-primary"
              onClick={() => setStep(2)}
              disabled={!role}
            >
              {t("next")}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Exchange Selection */}
      {step === 2 && (
        <div>
          <h2
            style={{
              fontSize: "22px",
              fontWeight: 700,
              marginBottom: "8px",
              color: "var(--text-primary)",
            }}
          >
            {t("exchangeTitle")}
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              marginBottom: "20px",
            }}
          >
            {t("exchangeSubtitle")}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "24px",
            }}
          >
            {EXCHANGES.map((name) => (
              <button
                key={name}
                onClick={() => toggleExchange(name)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  background: selectedExchanges.includes(name)
                    ? "var(--accent)"
                    : "var(--bg-card)",
                  color: selectedExchanges.includes(name)
                    ? "white"
                    : "var(--text-secondary)",
                  border: selectedExchanges.includes(name)
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                  transition: "all 0.15s",
                }}
              >
                {name}
              </button>
            ))}
            <button
              onClick={() => toggleExchange("other")}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                cursor: "pointer",
                background: selectedExchanges.includes("other")
                  ? "var(--accent)"
                  : "var(--bg-card)",
                color: selectedExchanges.includes("other")
                  ? "white"
                  : "var(--text-muted)",
                border: selectedExchanges.includes("other")
                  ? "1px solid var(--accent)"
                  : "1px dashed var(--border)",
              }}
            >
              {t("exchangeOther")}
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              {t("back")}
            </button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              {t("next")}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Import Method */}
      {step === 3 && (
        <div>
          <h2
            style={{
              fontSize: "22px",
              fontWeight: 700,
              marginBottom: "8px",
              color: "var(--text-primary)",
            }}
          >
            {t("importTitle")}
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              marginBottom: "20px",
            }}
          >
            {t("importSubtitle")}
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {(
              [
                {
                  key: "csv",
                  label: "importCsv",
                  desc: "importCsvDesc",
                  icon: "\u{1F4C1}",
                },
                {
                  key: "api",
                  label: "importApi",
                  desc: "importApiDesc",
                  icon: "\u{1F50C}",
                },
                {
                  key: "later",
                  label: "importLater",
                  desc: "importLaterDesc",
                  icon: "\u23ED\uFE0F",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => goImport(opt.key)}
                className="card"
                style={{
                  padding: "16px 20px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                }}
              >
                <span style={{ fontSize: "24px" }}>{opt.icon}</span>
                <div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {t(opt.label)}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      marginTop: "2px",
                    }}
                  >
                    {t(opt.desc)}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: "24px" }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              {t("back")}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Ready */}
      {step === 4 && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>
            {"\u{1F389}"}
          </div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 800,
              marginBottom: "8px",
              color: "var(--text-primary)",
            }}
          >
            {t("readyTitle")}
          </h2>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary)",
              marginBottom: "32px",
            }}
          >
            {t("readySubtitle")}
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              maxWidth: "360px",
              margin: "0 auto 32px",
            }}
          >
            {(["readyTip1", "readyTip2", "readyTip3"] as const).map(
              (tip, i) => (
                <div
                  key={tip}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    background: "var(--bg-surface)",
                    borderRadius: "var(--radius-sm, 8px)",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: "28px",
                      height: "28px",
                      lineHeight: "28px",
                      textAlign: "center",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{ fontSize: "14px", color: "var(--text-secondary)" }}
                  >
                    {t(tip)}
                  </span>
                </div>
              ),
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={complete}
            style={{ padding: "14px 40px", fontSize: "16px" }}
          >
            {t("done")}
          </button>
        </div>
      )}
    </div>
  );
}
