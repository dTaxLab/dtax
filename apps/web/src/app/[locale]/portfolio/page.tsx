"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getPortfolioHoldings, getPrices } from "@/lib/api";
import type { PortfolioAnalysis } from "@/lib/api";
import { useFiatFormatter } from "@/lib/use-fiat";

function formatAmount(value: number, asset: string): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${asset}`;
}

function formatPct(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default function PortfolioPage() {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const { formatFiat } = useFiatFormatter();

  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [fetchingPrices, setFetchingPrices] = useState(false);

  // Price inputs
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [appliedPrices, setAppliedPrices] = useState<
    Record<string, number> | undefined
  >();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(prices?: Record<string, number>) {
    setLoading(true);
    setError(null);
    try {
      const res = await getPortfolioHoldings(prices);
      setAnalysis(res.data);

      // On first load, auto-fetch prices for all assets
      if (!prices && res.data.positions.length > 0) {
        const inputs: Record<string, string> = {};
        for (const pos of res.data.positions) {
          inputs[pos.asset] = "";
        }
        setPriceInputs(inputs);
        autoFetchPrices(res.data.positions.map((p) => p.asset));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }

  async function autoFetchPrices(assets: string[]) {
    setFetchingPrices(true);
    setPriceError(null);
    try {
      const res = await getPrices(assets);
      const prices = res.data.prices;
      if (Object.keys(prices).length > 0) {
        // Populate inputs with fetched prices
        const inputs: Record<string, string> = {};
        for (const asset of assets) {
          inputs[asset] =
            prices[asset] !== undefined ? String(prices[asset]) : "";
        }
        setPriceInputs(inputs);
        setAppliedPrices(prices);
        // Reload portfolio with prices
        const res2 = await getPortfolioHoldings(prices);
        setAnalysis(res2.data);
      }
    } catch (e) {
      setPriceError(e instanceof Error ? e.message : "Failed to fetch prices");
    } finally {
      setFetchingPrices(false);
    }
  }

  function handlePriceChange(asset: string, value: string) {
    setPriceInputs((prev) => ({ ...prev, [asset]: value }));
  }

  function handleApplyPrices() {
    const prices: Record<string, number> = {};
    for (const [asset, val] of Object.entries(priceInputs)) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) prices[asset] = num;
    }
    if (Object.keys(prices).length > 0) {
      setAppliedPrices(prices);
      loadData(prices);
    }
  }

  async function handleRefreshPrices() {
    if (!analysis) return;
    await autoFetchPrices(analysis.positions.map((p) => p.asset));
  }

  if (loading && !analysis) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="loading-pulse" style={{ fontSize: "48px" }}>
          📊
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "16px" }}>
          {t("loading")}
        </p>
      </div>
    );
  }

  if (error && !analysis) {
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
          onClick={() => loadData()}
        >
          {tc("retry")}
        </button>
      </div>
    );
  }

  const hasPrices = appliedPrices && Object.keys(appliedPrices).length > 0;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-subtitle">{t("subtitle")}</p>
        </div>
      </div>

      {/* Summary Cards */}
      {analysis && (
        <div className="grid-4" style={{ marginBottom: "32px" }}>
          <div className="stat-card">
            <span className="stat-label">{t("totalCostBasis")}</span>
            <span className="stat-value neutral">
              {formatFiat(analysis.totalCostBasis)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t("totalValue")}</span>
            <span className="stat-value neutral">
              {hasPrices ? formatFiat(analysis.totalCurrentValue) : "—"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t("unrealizedGL")}</span>
            <span
              className={`stat-value ${
                analysis.totalUnrealizedGainLoss !== undefined
                  ? analysis.totalUnrealizedGainLoss >= 0
                    ? "positive"
                    : "negative"
                  : "neutral"
              }`}
            >
              {hasPrices ? formatFiat(analysis.totalUnrealizedGainLoss) : "—"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t("positions")}</span>
            <span className="stat-value neutral">
              {analysis.positions.length}
            </span>
          </div>
        </div>
      )}

      {/* Price Input Section */}
      {analysis && analysis.positions.length > 0 && (
        <div className="card" style={{ marginBottom: "24px", padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: "600" }}>
              {t("pricesTitle")}
            </h3>
            <button
              className="btn btn-secondary"
              onClick={handleRefreshPrices}
              disabled={fetchingPrices}
              style={{ fontSize: "13px", padding: "4px 12px" }}
            >
              {fetchingPrices ? t("fetchingPrices") : t("refreshPrices")}
            </button>
          </div>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            {t("pricesHint")}
          </p>
          {priceError && (
            <p
              style={{
                color: "var(--red)",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            >
              {priceError}
            </p>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              alignItems: "end",
            }}
          >
            {analysis.positions.map((pos) => (
              <div
                key={pos.asset}
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "var(--text-muted)",
                  }}
                >
                  {pos.asset}
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder={t("priceInput")}
                  value={priceInputs[pos.asset] || ""}
                  onChange={(e) => handlePriceChange(pos.asset, e.target.value)}
                  style={{
                    width: "140px",
                    padding: "6px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                  }}
                />
              </div>
            ))}
            <button
              className="btn btn-primary"
              onClick={handleApplyPrices}
              disabled={loading}
              style={{ height: "34px" }}
            >
              {t("applyPrices")}
            </button>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      {analysis && analysis.positions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
          <p style={{ color: "var(--text-muted)" }}>{t("noPositions")}</p>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "13px",
              marginTop: "8px",
            }}
          >
            {t("noPositionsHint")}
          </p>
        </div>
      ) : (
        analysis && (
          <div className="table-container" style={{ marginBottom: "32px" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("asset")}</th>
                  <th style={{ textAlign: "right" }}>{t("amount")}</th>
                  <th style={{ textAlign: "right" }}>{t("avgCost")}</th>
                  {hasPrices && (
                    <th style={{ textAlign: "right" }}>{t("currentPrice")}</th>
                  )}
                  <th style={{ textAlign: "right" }}>{t("totalCostBasis")}</th>
                  {hasPrices && (
                    <th style={{ textAlign: "right" }}>{t("value")}</th>
                  )}
                  {hasPrices && (
                    <th style={{ textAlign: "right" }}>{t("gainLoss")}</th>
                  )}
                  <th style={{ textAlign: "center" }}>{t("lots")}</th>
                </tr>
              </thead>
              <tbody>
                {analysis.positions.map((pos) => (
                  <tr key={pos.asset}>
                    <td
                      style={{ fontWeight: 600, color: "var(--text-primary)" }}
                    >
                      {pos.asset}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {pos.totalAmount.toLocaleString("en-US", {
                        maximumFractionDigits: 8,
                      })}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {formatFiat(pos.avgCostPerUnit)}
                    </td>
                    {hasPrices && (
                      <td className="mono" style={{ textAlign: "right" }}>
                        {formatFiat(pos.currentPrice)}
                      </td>
                    )}
                    <td className="mono" style={{ textAlign: "right" }}>
                      {formatFiat(pos.totalCostBasis)}
                    </td>
                    {hasPrices && (
                      <td className="mono" style={{ textAlign: "right" }}>
                        {formatFiat(pos.currentValueUsd)}
                      </td>
                    )}
                    {hasPrices && (
                      <td className="mono" style={{ textAlign: "right" }}>
                        <span
                          style={{
                            color:
                              (pos.unrealizedGainLoss ?? 0) >= 0
                                ? "var(--green)"
                                : "var(--red)",
                          }}
                        >
                          {formatFiat(pos.unrealizedGainLoss)}
                          <span
                            style={{
                              fontSize: "12px",
                              marginLeft: "4px",
                              opacity: 0.7,
                            }}
                          >
                            {formatPct(pos.unrealizedPct)}
                          </span>
                        </span>
                      </td>
                    )}
                    <td style={{ textAlign: "center" }}>{pos.lotCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Tax-Loss Harvesting Section */}
      {analysis && (
        <div style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: "600",
              marginBottom: "16px",
            }}
          >
            {t("tlh.title")}
          </h2>

          {analysis.tlhOpportunities.length === 0 ? (
            <div
              className="card"
              style={{ textAlign: "center", padding: "32px" }}
            >
              <p style={{ color: "var(--text-muted)" }}>
                {hasPrices
                  ? t("tlh.noOpportunities")
                  : t("tlh.noOpportunitiesHint")}
              </p>
            </div>
          ) : (
            <>
              <div
                className="stat-card"
                style={{
                  marginBottom: "16px",
                  borderColor: "var(--red)",
                  borderWidth: "2px",
                }}
              >
                <span className="stat-label">{t("tlh.totalAvailable")}</span>
                <span className="stat-value negative">
                  {formatFiat(analysis.totalTlhAvailable)}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {analysis.tlhOpportunities.map((opp) => (
                  <div
                    key={opp.asset}
                    className="card"
                    style={{ padding: "16px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "16px" }}>
                        {opp.asset}
                      </span>
                      <span
                        style={{
                          color: "var(--red)",
                          fontWeight: 600,
                          fontSize: "16px",
                        }}
                      >
                        {formatFiat(opp.unrealizedLoss)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "12px",
                        fontSize: "14px",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                          }}
                        >
                          {t("tlh.amountToSell")}
                        </span>
                        <div className="mono">
                          {formatAmount(opp.totalAmount, opp.asset)}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                          }}
                        >
                          {t("tlh.costBasis")}
                        </span>
                        <div className="mono">
                          {formatFiat(opp.totalCostBasis)}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                          }}
                        >
                          {t("tlh.currentValue")}
                        </span>
                        <div className="mono">
                          {formatFiat(opp.currentValue)}
                        </div>
                      </div>
                    </div>
                    {opp.hasShortTermLots && (
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "8px 12px",
                          background:
                            "var(--yellow-bg, rgba(234, 179, 8, 0.1))",
                          borderRadius: "6px",
                          fontSize: "13px",
                          color: "var(--yellow, #eab308)",
                        }}
                      >
                        {t("tlh.washSaleWarning")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
