"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getAiStats,
  aiClassifyAll,
  confirmAiClassification,
  correctClassification,
  getTransactions,
} from "@/lib/api";
import type { Transaction } from "@/lib/api";

const TX_TYPES = [
  "BUY",
  "SELL",
  "TRADE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "GIFT_RECEIVED",
  "GIFT_SENT",
  "LOST",
  "STOLEN",
  "FORK",
  "MARGIN_TRADE",
  "LIQUIDATION",
  "INTERNAL_TRANSFER",
  "DEX_SWAP",
  "LP_DEPOSIT",
  "LP_WITHDRAWAL",
  "LP_REWARD",
  "WRAP",
  "UNWRAP",
  "BRIDGE_OUT",
  "BRIDGE_IN",
  "CONTRACT_APPROVAL",
  "NFT_MINT",
  "NFT_PURCHASE",
  "NFT_SALE",
];

interface AiReviewBannerProps {
  onRefresh: () => void;
}

export function AiReviewBanner({ onRefresh }: AiReviewBannerProps) {
  const t = useTranslations("aiReview");
  const [stats, setStats] = useState<{
    aiClassified: number;
    unknownCount: number;
    aiEnabled: boolean;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [aiTxs, setAiTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getAiStats()
      .then((res) => setStats(res.data))
      .catch(() => {});
  }, []);

  if (!stats || (!stats.aiClassified && !stats.unknownCount)) return null;

  async function loadAiTransactions() {
    setLoading(true);
    try {
      // Fetch AI-classified transactions that need review (confidence < 1.0)
      const res = await getTransactions(1, 50);
      const aiOnly = res.data.filter(
        (tx) => tx.aiClassified && (tx.aiConfidence ?? 0) < 1.0,
      );
      setAiTxs(aiOnly);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  function toggleExpand() {
    if (!expanded) loadAiTransactions();
    setExpanded(!expanded);
  }

  async function handleClassifyAll() {
    setClassifyLoading(true);
    setMsg(null);
    try {
      const res = await aiClassifyAll();
      setMsg(t("classifiedCount", { count: res.data.classified }));
      onRefresh();
      if (expanded) loadAiTransactions();
      const newStats = await getAiStats();
      setStats(newStats.data);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
    setClassifyLoading(false);
  }

  async function handleConfirm(id: string) {
    try {
      await confirmAiClassification(id);
      setAiTxs((prev) => prev.filter((tx) => tx.id !== id));
      onRefresh();
    } catch {
      /* ignore */
    }
  }

  async function handleCorrect(id: string, newType: string) {
    try {
      await correctClassification(id, newType);
      setAiTxs((prev) => prev.filter((tx) => tx.id !== id));
      onRefresh();
    } catch {
      /* ignore */
    }
  }

  function confidenceColor(c: number): string {
    if (c >= 0.9) return "var(--green)";
    if (c >= 0.7) return "#eab308";
    return "var(--red-light)";
  }

  return (
    <div
      className="card"
      style={{
        padding: "12px 16px",
        marginBottom: "12px",
        background: "var(--card-bg)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <span style={{ fontSize: "14px" }}>
            {stats.aiClassified > 0 &&
              t("pendingReview", { count: stats.aiClassified })}
            {stats.unknownCount > 0 &&
              ` · ${t("unknownCount", { count: stats.unknownCount })}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {stats.unknownCount > 0 && stats.aiEnabled && (
            <button
              className="btn btn-secondary"
              onClick={handleClassifyAll}
              disabled={classifyLoading}
              style={{ fontSize: "13px", padding: "4px 12px" }}
            >
              {classifyLoading ? "..." : t("classifyAll")}
            </button>
          )}
          {stats.aiClassified > 0 && (
            <button
              className="btn btn-secondary"
              onClick={toggleExpand}
              style={{ fontSize: "13px", padding: "4px 12px" }}
            >
              {expanded ? t("collapse") : t("reviewAll")}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div
          style={{ fontSize: "13px", marginTop: "8px", color: "var(--green)" }}
        >
          {msg}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: "12px" }}>
          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "16px",
                color: "var(--text-muted)",
              }}
            >
              {t("loading")}
            </div>
          ) : aiTxs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "16px",
                color: "var(--text-muted)",
              }}
            >
              {t("noReview")}
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                fontSize: "13px",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    {t("asset")}
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    {t("originalType")}
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    {t("aiType")}
                  </th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>
                    {t("confidence")}
                  </th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {aiTxs.map((tx) => (
                  <tr
                    key={tx.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "6px 8px" }}>
                      {tx.sentAsset || tx.receivedAsset || "-"}
                    </td>
                    <td
                      style={{ padding: "6px 8px", color: "var(--text-muted)" }}
                    >
                      {tx.originalType || "UNKNOWN"}
                    </td>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                      {tx.type}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <span
                        style={{
                          color: confidenceColor(tx.aiConfidence ?? 0),
                          fontWeight: 600,
                        }}
                      >
                        {((tx.aiConfidence ?? 0) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: "12px", padding: "2px 8px" }}
                          onClick={() => handleConfirm(tx.id)}
                        >
                          {t("confirm")}
                        </button>
                        <select
                          style={{
                            fontSize: "12px",
                            padding: "2px 4px",
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            color: "var(--text-primary)",
                          }}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value)
                              handleCorrect(tx.id, e.target.value);
                          }}
                        >
                          <option value="" disabled>
                            {t("correct")}
                          </option>
                          {TX_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
