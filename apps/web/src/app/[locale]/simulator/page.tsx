"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { simulateSale } from "@/lib/api";
import type { SimulationResult } from "@/lib/api";
import { useFiatFormatter } from "@/lib/use-fiat";

export default function SimulatorPage() {
  const t = useTranslations("simulator");
  const tc = useTranslations("common");
  const { formatFiat } = useFiatFormatter();

  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [method, setMethod] = useState<"FIFO" | "LIFO" | "HIFO">("FIFO");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);

  async function handleSimulate() {
    const parsedAmount = parseFloat(amount);
    const parsedPrice = parseFloat(pricePerUnit);
    if (
      !asset.trim() ||
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      isNaN(parsedPrice) ||
      parsedPrice < 0
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await simulateSale({
        asset: asset.trim().toUpperCase(),
        amount: parsedAmount,
        pricePerUnit: parsedPrice,
        method,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const holdingPeriodColor = (hp: string) => {
    if (hp === "SHORT_TERM") return "var(--yellow, #eab308)";
    if (hp === "LONG_TERM") return "var(--green)";
    return "var(--orange, #f97316)";
  };

  const holdingPeriodLabel = (hp: string) => {
    if (hp === "SHORT_TERM") return t("shortTerm");
    if (hp === "LONG_TERM") return t("longTerm");
    return t("mixed");
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-subtitle">{t("subtitle")}</p>
        </div>
      </div>

      {/* Input Form */}
      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              {t("asset")}
            </label>
            <input
              type="text"
              placeholder="BTC"
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              style={{
                width: "120px",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              {t("amount")}
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="1.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: "140px",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              {t("pricePerUnit")}
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="50000"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              style={{
                width: "160px",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              {t("method")}
            </label>
            <select
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as "FIFO" | "LIFO" | "HIFO")
              }
              style={{
                width: "120px",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "14px",
              }}
            >
              <option value="FIFO">FIFO</option>
              <option value="LIFO">LIFO</option>
              <option value="HIFO">HIFO</option>
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSimulate}
            disabled={loading || !asset.trim() || !amount || !pricePerUnit}
            style={{ height: "38px" }}
          >
            {loading ? tc("loading") : t("simulate")}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: "8px",
            color: "var(--red)",
            marginBottom: "24px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {/* No results placeholder */}
      {!result && !error && (
        <div className="card" style={{ textAlign: "center", padding: "48px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "15px" }}>
            {t("noResults")}
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary Card */}
          <div className="grid-4" style={{ marginBottom: "24px" }}>
            <div className="stat-card">
              <span className="stat-label">{t("projectedGainLoss")}</span>
              <span
                className={`stat-value ${result.projectedGainLoss >= 0 ? "positive" : "negative"}`}
              >
                {formatFiat(result.projectedGainLoss)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t("holdingPeriod")}</span>
              <span
                className="stat-value"
                style={{ color: holdingPeriodColor(result.holdingPeriod) }}
              >
                {holdingPeriodLabel(result.holdingPeriod)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t("proceeds")}</span>
              <span className="stat-value neutral">
                {formatFiat(result.proceeds)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t("costBasis")}</span>
              <span className="stat-value neutral">
                {formatFiat(result.costBasis)}
              </span>
            </div>
          </div>

          {/* Breakdown for MIXED holding period */}
          {result.holdingPeriod === "MIXED" && (
            <div
              className="card"
              style={{
                padding: "16px 20px",
                marginBottom: "24px",
                display: "flex",
                gap: "32px",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  {t("shortTermGL")}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color:
                      result.shortTermGainLoss >= 0
                        ? "var(--green)"
                        : "var(--red)",
                  }}
                >
                  {formatFiat(result.shortTermGainLoss)}
                </span>
              </div>
              <div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  {t("longTermGL")}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color:
                      result.longTermGainLoss >= 0
                        ? "var(--green)"
                        : "var(--red)",
                  }}
                >
                  {formatFiat(result.longTermGainLoss)}
                </span>
              </div>
            </div>
          )}

          {/* Wash Sale Warning */}
          {result.washSaleRisk && (
            <div
              style={{
                padding: "12px 16px",
                background: "var(--yellow-bg, rgba(234, 179, 8, 0.1))",
                border: "1px solid var(--yellow, #eab308)",
                borderRadius: "8px",
                color: "var(--yellow, #eab308)",
                marginBottom: "24px",
                fontSize: "14px",
              }}
            >
              {t("washSaleWarning", {
                amount: formatFiat(result.washSaleDisallowed),
              })}
            </div>
          )}

          {/* Insufficient Lots Warning */}
          {result.insufficientLots && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--red)",
                borderRadius: "8px",
                color: "var(--red)",
                marginBottom: "24px",
                fontSize: "14px",
              }}
            >
              {t("insufficientLots", {
                available: result.availableAmount.toLocaleString("en-US", {
                  maximumFractionDigits: 8,
                }),
                requested: parseFloat(amount).toLocaleString("en-US", {
                  maximumFractionDigits: 8,
                }),
                asset: asset.toUpperCase(),
              })}
            </div>
          )}

          {/* Matched Lots Table */}
          {result.matchedLots.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "12px",
                }}
              >
                {t("matchedLots")}
              </h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>{t("lotId")}</th>
                      <th style={{ textAlign: "right" }}>{t("amount")}</th>
                      <th style={{ textAlign: "right" }}>{t("costBasis")}</th>
                      <th>{t("acquired")}</th>
                      <th>{t("holdingPeriod")}</th>
                      <th style={{ textAlign: "right" }}>{t("gainLoss")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matchedLots.map((lot) => (
                      <tr key={lot.lotId}>
                        <td
                          className="mono"
                          style={{
                            fontSize: "12px",
                            maxWidth: "100px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={lot.lotId}
                        >
                          {lot.lotId.slice(0, 8)}...
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>
                          {lot.amount.toLocaleString("en-US", {
                            maximumFractionDigits: 8,
                          })}
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>
                          {formatFiat(lot.costBasis)}
                        </td>
                        <td>{new Date(lot.acquiredAt).toLocaleDateString()}</td>
                        <td>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: 600,
                              background:
                                lot.holdingPeriod === "LONG_TERM"
                                  ? "rgba(34, 197, 94, 0.1)"
                                  : "rgba(234, 179, 8, 0.1)",
                              color:
                                lot.holdingPeriod === "LONG_TERM"
                                  ? "var(--green)"
                                  : "var(--yellow, #eab308)",
                            }}
                          >
                            {lot.holdingPeriod === "LONG_TERM"
                              ? t("longTerm")
                              : t("shortTerm")}
                          </span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>
                          <span
                            style={{
                              color:
                                lot.gainLoss >= 0
                                  ? "var(--green)"
                                  : "var(--red)",
                            }}
                          >
                            {formatFiat(lot.gainLoss)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Remaining Position */}
          <div className="card" style={{ padding: "20px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                marginBottom: "12px",
              }}
            >
              {t("remainingPosition")}
            </h3>
            <div
              style={{
                display: "flex",
                gap: "32px",
                fontSize: "14px",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  {t("remaining")}
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {result.remainingPosition.totalAmount.toLocaleString(
                    "en-US",
                    { maximumFractionDigits: 8 },
                  )}{" "}
                  {asset.toUpperCase()}
                </span>
              </div>
              <div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  {t("costBasis")}
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {formatFiat(result.remainingPosition.totalCostBasis)}
                </span>
              </div>
              <div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  {t("avgCost")}
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {formatFiat(result.remainingPosition.avgCostPerUnit)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
