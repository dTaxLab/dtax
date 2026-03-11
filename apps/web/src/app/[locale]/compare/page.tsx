"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getTaxSummary } from "@/lib/api";
import type { TaxSummary } from "@/lib/api";
import { getPreferences } from "@/lib/preferences";
import { useFiatFormatter } from "@/lib/use-fiat";

const currentYear = new Date().getFullYear();
const ALL_YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

function colorClass(v: number): string {
  if (v > 0) return "var(--green-light, #22c55e)";
  if (v < 0) return "var(--red-light, #ef4444)";
  return "var(--text-muted)";
}

export default function ComparePage() {
  const t = useTranslations("compare");
  const { formatFiat } = useFiatFormatter();
  const prefs = typeof window !== "undefined" ? getPreferences() : null;
  const [method, setMethod] = useState<string>(
    prefs?.defaultMethod === "SPECIFIC_ID"
      ? "FIFO"
      : (prefs?.defaultMethod ?? "FIFO"),
  );
  const [selectedYears, setSelectedYears] = useState<Set<number>>(
    new Set([currentYear - 1, currentYear - 2]),
  );
  const [reports, setReports] = useState<Map<number, TaxSummary | null>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function toggleYear(year: number) {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  async function handleCompare() {
    setLoading(true);
    setErrors([]);
    const results = new Map<number, TaxSummary | null>();
    const errs: string[] = [];

    await Promise.all(
      Array.from(selectedYears).map(async (year) => {
        try {
          const res = await getTaxSummary(year, method);
          results.set(year, res.data);
        } catch {
          results.set(year, null);
          errs.push(t("noData", { year }));
        }
      }),
    );

    setReports(results);
    setErrors(errs);
    setLoading(false);
  }

  const sortedYears = Array.from(selectedYears).sort((a, b) => a - b);
  const hasReports = Array.from(reports.values()).some((r) => r !== null);

  const selectStyle = {
    padding: "10px 16px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontSize: "14px",
  };

  const thStyle = {
    padding: "10px 16px",
    textAlign: "left" as const,
    fontWeight: 600,
    borderBottom: "1px solid var(--border)",
    fontSize: "13px",
  };

  const tdStyle = {
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: "14px",
    fontFamily: "var(--font-mono, monospace)",
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-subtitle">{t("subtitle")}</p>
        </div>
      </div>

      {/* Year selector */}
      <div className="card" style={{ padding: "20px", marginBottom: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              fontWeight: 500,
            }}
          >
            {t("selectYears")}:
          </span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ALL_YEARS.map((y) => (
              <button
                key={y}
                onClick={() => toggleYear(y)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: "13px",
                  cursor: "pointer",
                  background: selectedYears.has(y)
                    ? "var(--accent)"
                    : "var(--bg-secondary)",
                  color: selectedYears.has(y) ? "#fff" : "var(--text-primary)",
                }}
              >
                {y}
              </button>
            ))}
          </div>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={selectStyle}
          >
            <option value="FIFO">FIFO</option>
            <option value="LIFO">LIFO</option>
            <option value="HIFO">HIFO</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={handleCompare}
            disabled={loading || selectedYears.size === 0}
          >
            {loading ? "..." : t("compare")}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div
          className="card"
          style={{
            padding: "12px 16px",
            marginBottom: "16px",
            background: "rgba(234,179,8,0.1)",
            border: "1px solid rgba(234,179,8,0.3)",
            borderRadius: "var(--radius-sm)",
            fontSize: "13px",
            color: "var(--text-muted)",
          }}
        >
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {/* Comparison table */}
      {hasReports && (
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                <th style={thStyle}>{t("year")}</th>
                <th style={thStyle}>{t("shortTermGains")}</th>
                <th style={thStyle}>{t("shortTermLosses")}</th>
                <th style={thStyle}>{t("longTermGains")}</th>
                <th style={thStyle}>{t("longTermLosses")}</th>
                <th style={thStyle}>{t("netGainLoss")}</th>
                <th style={thStyle}>{t("transactions")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedYears.map((year) => {
                const r = reports.get(year);
                if (!r) return null;
                const net = r.netGainLoss;
                return (
                  <tr key={year}>
                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: 600,
                        fontFamily: "inherit",
                      }}
                    >
                      {year}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: "var(--green-light, #22c55e)",
                      }}
                    >
                      {formatFiat(r.shortTermGains)}
                    </td>
                    <td
                      style={{ ...tdStyle, color: "var(--red-light, #ef4444)" }}
                    >
                      {formatFiat(r.shortTermLosses)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: "var(--green-light, #22c55e)",
                      }}
                    >
                      {formatFiat(r.longTermGains)}
                    </td>
                    <td
                      style={{ ...tdStyle, color: "var(--red-light, #ef4444)" }}
                    >
                      {formatFiat(r.longTermLosses)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: 700,
                        color: colorClass(net),
                      }}
                    >
                      {formatFiat(net)}
                    </td>
                    <td style={tdStyle}>{r.totalTransactions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reports.size > 0 && !hasReports && (
        <div
          className="card"
          style={{
            padding: "48px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          {t("noReports")}
        </div>
      )}
    </div>
  );
}
