"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getTransactions,
  getTaxSummary,
  calculateTax,
  getDataSources,
} from "@/lib/api";
import type { Transaction, TaxSummary, DataSource } from "@/lib/api";
import { getBadgeClass } from "./transactions/components/shared";
import { getPreferences } from "@/lib/preferences";
import { useFiatFormatter } from "@/lib/use-fiat";

function formatAmount(value: string | null, asset: string | null): string {
  if (!value || !asset) return "—";
  return `${parseFloat(value).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${asset}`;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Dashboard() {
  const t = useTranslations("dashboard");
  const tt = useTranslations("table");
  const tc = useTranslations("common");
  const tf = useTranslations("footer");
  const tType = useTranslations("txTypes");
  const { formatFiat } = useFiatFormatter();

  const prefs = typeof window !== "undefined" ? getPreferences() : null;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(prefs?.defaultYear ?? currentYear - 1);
  const [method, setMethod] = useState<string>(
    prefs?.defaultMethod === "SPECIFIC_ID"
      ? "FIFO"
      : (prefs?.defaultMethod ?? "FIFO"),
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txMeta, setTxMeta] = useState({ total: 0, page: 1, totalPages: 0 });
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);

  useEffect(() => {
    loadData();
  }, [year, method]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [txRes, taxRes, dsRes] = await Promise.allSettled([
        getTransactions(1, 10),
        getTaxSummary(year, method),
        getDataSources(),
      ]);
      if (txRes.status === "fulfilled") {
        setTransactions(txRes.value.data);
        setTxMeta(txRes.value.meta);
      }
      if (taxRes.status === "fulfilled") {
        setTaxSummary(taxRes.value.data);
      }
      if (dsRes.status === "fulfilled") {
        setDataSources(dsRes.value.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculate() {
    setCalculating(true);
    try {
      const res = await calculateTax(year, method);
      setTaxSummary(res.data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCalculating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="loading-pulse" style={{ fontSize: "48px" }}>
          🧮
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "16px" }}>
          {tc("loading")}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
        <p style={{ color: "var(--red)" }}>{error}</p>
        <p
          style={{
            color: "var(--text-muted)",
            marginTop: "8px",
            fontSize: "14px",
          }}
        >
          {tc("errorHint")} <code>pnpm --filter @dtax/api dev</code>
        </p>
        <button
          className="btn btn-primary"
          style={{ marginTop: "16px" }}
          onClick={loadData}
        >
          {tc("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-subtitle">{t("subtitle", { year, method })}</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontSize: "14px",
            }}
          >
            {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontSize: "14px",
            }}
          >
            <option value="FIFO">FIFO</option>
            <option value="LIFO">LIFO</option>
            <option value="HIFO">HIFO</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={handleCalculate}
            disabled={calculating}
          >
            {calculating ? `⏳ ${t("calculating")}` : `🧮 ${t("calculateTax")}`}
          </button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: "32px" }}>
        <div className="stat-card">
          <span className="stat-label">{t("netGainLoss")}</span>
          <span
            className={`stat-value ${taxSummary && taxSummary.netGainLoss >= 0 ? "positive" : "negative"}`}
          >
            {taxSummary ? formatFiat(taxSummary.netGainLoss) : "—"}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("longTermGains")}</span>
          <span
            className={`stat-value ${taxSummary && taxSummary.longTermGains - taxSummary.longTermLosses >= 0 ? "positive" : "negative"}`}
          >
            {taxSummary
              ? formatFiat(taxSummary.longTermGains - taxSummary.longTermLosses)
              : "—"}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("shortTermGains")}</span>
          <span
            className={`stat-value ${taxSummary && taxSummary.shortTermGains - taxSummary.shortTermLosses >= 0 ? "positive" : "negative"}`}
          >
            {taxSummary
              ? formatFiat(
                  taxSummary.shortTermGains - taxSummary.shortTermLosses,
                )
              : "—"}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("transactions")}</span>
          <span className="stat-value neutral">{txMeta.total}</span>
        </div>
        {taxSummary && (taxSummary.income?.total || taxSummary.totalIncome) ? (
          <div
            className="stat-card"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <span className="stat-label">{t("ordinaryIncome")}</span>
            <span className="stat-value" style={{ color: "var(--accent)" }}>
              {formatFiat(
                taxSummary.income?.total ?? taxSummary.totalIncome ?? 0,
              )}
            </span>
            {taxSummary.income && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                  lineHeight: 1.6,
                }}
              >
                {taxSummary.income.staking > 0 && (
                  <div>
                    {t("stakingIncome")}:{" "}
                    {formatFiat(taxSummary.income.staking)}
                  </div>
                )}
                {taxSummary.income.mining > 0 && (
                  <div>
                    {t("miningIncome")}: {formatFiat(taxSummary.income.mining)}
                  </div>
                )}
                {taxSummary.income.airdrops > 0 && (
                  <div>
                    {t("airdropIncome")}:{" "}
                    {formatFiat(taxSummary.income.airdrops)}
                  </div>
                )}
                {taxSummary.income.interest > 0 && (
                  <div>
                    {t("interestIncome")}:{" "}
                    {formatFiat(taxSummary.income.interest)}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Quick Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "32px",
        }}
      >
        {[
          {
            href: "transactions",
            label: t("actionImport"),
            desc: t("actionImportDesc"),
            icon: "📁",
          },
          {
            href: "tax",
            label: t("actionTaxReport"),
            desc: t("actionTaxReportDesc"),
            icon: "📋",
          },
          {
            href: "portfolio",
            label: t("actionPortfolio"),
            desc: t("actionPortfolioDesc"),
            icon: "💼",
          },
          {
            href: "compare",
            label: t("actionCompare"),
            desc: t("actionCompareDesc"),
            icon: "📊",
          },
        ].map((action) => (
          <a
            key={action.href}
            href={action.href}
            className="card"
            style={{
              padding: "16px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              transition: "border-color 0.15s",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "24px" }}>{action.icon}</span>
            <div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {action.label}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {action.desc}
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Data Sources summary */}
      {dataSources.length > 0 && (
        <div
          className="card"
          style={{
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>
              {t("dataSources")}
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {dataSources.map((ds) => (
                <span
                  key={ds.id}
                  style={{
                    fontSize: "12px",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {ds.name}{" "}
                  <span style={{ color: "var(--text-muted)" }}>
                    ({ds.transactionCount})
                  </span>
                </span>
              ))}
            </div>
          </div>
          <a
            href="settings"
            style={{
              fontSize: "13px",
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            {t("viewAll")}
          </a>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: "600" }}>
          {t("recentTransactions")}
        </h2>
        <a
          href="transactions"
          className="btn btn-secondary"
          style={{ fontSize: "13px" }}
        >
          {t("viewAll")}
        </a>
      </div>

      {transactions.length === 0 ? (
        <div className="card" style={{ padding: "40px 24px" }}>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "20px",
              textAlign: "center",
            }}
          >
            {t("getStarted")}
          </h3>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              maxWidth: "400px",
              margin: "0 auto",
            }}
          >
            {[t("step1"), t("step2"), t("step3")].map((step, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  background: "var(--bg-surface)",
                  borderRadius: "var(--radius-sm)",
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
                  {step}
                </span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <a
              href="transactions"
              className="btn btn-primary"
              style={{ textDecoration: "none" }}
            >
              {t("actionImport")}
            </a>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{tt("date")}</th>
                <th>{tt("type")}</th>
                <th>{tt("asset")}</th>
                <th>{tt("amount")}</th>
                <th style={{ textAlign: "right" }}>{tt("valueUsd")}</th>
                <th style={{ textAlign: "right" }}>{tt("gainLoss")}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const asset = tx.receivedAsset || tx.sentAsset || "—";
                const amount = tx.receivedAmount || tx.sentAmount;
                const value = tx.receivedValueUsd || tx.sentValueUsd;
                return (
                  <tr key={tx.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatDate(tx.timestamp, "en")}
                    </td>
                    <td>
                      <span className={getBadgeClass(tx.type)}>
                        {tType(tx.type)}
                      </span>
                    </td>
                    <td
                      style={{ fontWeight: 500, color: "var(--text-primary)" }}
                    >
                      {asset}
                    </td>
                    <td className="mono">{formatAmount(amount, asset)}</td>
                    <td style={{ textAlign: "right" }} className="mono">
                      {formatFiat(value)}
                    </td>
                    <td style={{ textAlign: "right" }} className="mono">
                      {tx.gainLoss ? (
                        <span
                          style={{
                            color:
                              parseFloat(tx.gainLoss) >= 0
                                ? "var(--green)"
                                : "var(--red)",
                          }}
                        >
                          {formatFiat(tx.gainLoss)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          marginTop: "48px",
          paddingTop: "24px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "13px",
          color: "var(--text-muted)",
          paddingBottom: "24px",
        }}
      >
        <span>{tf("version")}</span>
        <span>
          <a
            href="https://github.com/Phosmax/dtax"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            {tf("github")}
          </a>
          {" · "}
          <a
            href="https://dtax.dev"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            {tf("docs")}
          </a>
        </span>
      </div>
    </div>
  );
}
