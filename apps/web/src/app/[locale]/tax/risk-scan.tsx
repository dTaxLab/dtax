"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { runRiskScan, type RiskReport, type RiskItem } from "@/lib/api";
import { useFiatFormatter } from "@/lib/use-fiat";

interface RiskScanProps {
  year: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#6b7280",
};

const SCORE_COLOR = (score: number): string => {
  if (score >= 80) return "var(--green)";
  if (score >= 50) return "#eab308";
  return "#ef4444";
};

export function RiskScan({ year }: RiskScanProps) {
  const t = useTranslations("riskScan");
  const { formatFiat } = useFiatFormatter();
  const [report, setReport] = useState<RiskReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await runRiskScan(year);
      setReport(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    }
    setLoading(false);
  }

  return (
    <div style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>{t("title")}</h2>
        <button
          className="btn btn-secondary"
          onClick={handleScan}
          disabled={loading}
        >
          {loading ? t("scanning") : t("runScan")}
        </button>
      </div>

      {error && (
        <div
          className="card"
          style={{
            padding: "12px",
            background: "var(--red-bg)",
            color: "var(--red-light)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

      {report && (
        <div>
          {/* Score Card */}
          <div
            className="card"
            style={{
              padding: "24px",
              marginBottom: "16px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                fontWeight: 700,
                color: SCORE_COLOR(report.overallScore),
                lineHeight: 1,
              }}
            >
              {report.overallScore}
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              {t("scoreLabel")} / 100
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "24px",
                marginTop: "16px",
                fontSize: "14px",
              }}
            >
              <span style={{ color: SEVERITY_COLORS.high }}>
                {t("highCount", { count: report.summary.high })}
              </span>
              <span style={{ color: SEVERITY_COLORS.medium }}>
                {t("mediumCount", { count: report.summary.medium })}
              </span>
              <span style={{ color: SEVERITY_COLORS.low }}>
                {t("lowCount", { count: report.summary.low })}
              </span>
            </div>
            {report.summary.totalPotentialImpact > 0 && (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginTop: "8px",
                }}
              >
                {t("potentialImpact")}:{" "}
                {formatFiat(report.summary.totalPotentialImpact)}
              </div>
            )}
          </div>

          {/* Risk Items */}
          {report.items.length === 0 ? (
            <div
              className="card"
              style={{
                padding: "24px",
                textAlign: "center",
                color: "var(--green)",
              }}
            >
              {t("noRisks")}
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {report.items.map((item, idx) => (
                <RiskItemCard
                  key={idx}
                  item={item}
                  t={t}
                  formatFiat={formatFiat}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RiskItemCard({
  item,
  t,
  formatFiat,
}: {
  item: RiskItem;
  t: ReturnType<typeof useTranslations>;
  formatFiat: (n: string | number | null | undefined) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="card"
      style={{
        padding: "12px 16px",
        borderLeft: `4px solid ${SEVERITY_COLORS[item.severity]}`,
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              color: SEVERITY_COLORS[item.severity],
              padding: "2px 6px",
              borderRadius: "4px",
              background: `${SEVERITY_COLORS[item.severity]}18`,
            }}
          >
            {item.severity}
          </span>
          <span style={{ fontSize: "14px" }}>{item.description}</span>
        </div>
        {item.potentialTaxImpact > 0 && (
          <span
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {formatFiat(item.potentialTaxImpact)}
          </span>
        )}
      </div>
      {expanded && (
        <div
          style={{
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid var(--border)",
            fontSize: "13px",
          }}
        >
          <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>
            {t("suggestedAction")}:
          </div>
          <div>{item.suggestedAction}</div>
          <div
            style={{
              color: "var(--text-muted)",
              marginTop: "4px",
              fontSize: "12px",
            }}
          >
            {t("affectedCount", {
              count: item.affectedTransactionIds.length,
            })}
          </div>
        </div>
      )}
    </div>
  );
}
