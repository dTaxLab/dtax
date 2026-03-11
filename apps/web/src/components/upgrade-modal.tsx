"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  current: number;
  limit: number;
}

export function UpgradeModal({
  open,
  onClose,
  current,
  limit,
}: UpgradeModalProps) {
  const t = useTranslations("upgrade");
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: "PRO" }),
      });
      const data = await res.json();
      if (data.data?.url) window.location.href = data.data.url;
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 100;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "440px",
          width: "90%",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label={t("close")}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "20px",
            cursor: "pointer",
            lineHeight: 1,
            padding: "4px",
          }}
        >
          ✕
        </button>

        {/* Title */}
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          {t("title")}
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            marginBottom: "20px",
          }}
        >
          {t("subtitle", { current, limit })}
        </p>

        {/* Progress bar */}
        <div
          style={{
            height: "8px",
            background: "var(--bg-surface)",
            borderRadius: "4px",
            overflow: "hidden",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "var(--accent)",
              borderRadius: "4px",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* Benefits */}
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            marginBottom: "24px",
            lineHeight: 1.5,
          }}
        >
          {t("benefits")}
        </p>

        {/* Upgrade button */}
        <button
          className="btn btn-primary"
          onClick={handleUpgrade}
          disabled={loading}
          style={{ width: "100%", marginBottom: "12px" }}
        >
          {loading ? "..." : t("upgradePro")}
        </button>

        {/* View all plans link */}
        <a
          href="/pricing"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: "13px",
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          {t("viewPlans")}
        </a>
      </div>
    </div>
  );
}
