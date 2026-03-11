"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getPreferences,
  savePreferences,
  SUPPORTED_FIATS,
} from "@/lib/preferences";
import type { FiatCurrency } from "@/lib/preferences";
import { getDataSources, renameDataSource, deleteDataSource } from "@/lib/api";
import type { DataSource } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-context";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const METHODS = ["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"] as const;
const METHOD_I18N: Record<string, string> = {
  FIFO: "fifo",
  LIFO: "lifo",
  HIFO: "hifo",
  SPECIFIC_ID: "specificId",
};
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

interface BillingStatus {
  plan: "FREE" | "PRO" | "CPA";
  status: "active" | "canceled" | "past_due";
  taxYear: number | null;
  currentPeriodEnd: string | null;
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tTax = useTranslations("tax");
  const tDs = useTranslations("dataSources");
  const { user, token } = useAuth();
  const searchParams = useSearchParams();

  const [method, setMethod] = useState<string>("FIFO");
  const [year, setYear] = useState<number>(currentYear);
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>("USD");
  const [saved, setSaved] = useState(false);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const billingSuccess = searchParams.get("billing") === "success";

  useEffect(() => {
    const prefs = getPreferences();
    setMethod(prefs.defaultMethod);
    setYear(prefs.defaultYear);
    setFiatCurrency(prefs.fiatCurrency || "USD");
    loadSources();
    loadBillingStatus();
  }, []);

  async function loadSources() {
    try {
      const res = await getDataSources();
      setSources(res.data);
    } catch {
      /* ignore */
    }
  }

  async function loadBillingStatus() {
    try {
      const storedToken = getStoredToken();
      if (!storedToken) {
        setBillingLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/v1/billing/status`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        setBilling(json.data);
      }
    } catch {
      /* billing endpoint may not exist yet */
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleCheckout(plan: "PRO" | "CPA") {
    setUpgrading(plan);
    try {
      const storedToken = getStoredToken();
      const res = await fetch(`${API_BASE}/api/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedToken}`,
        },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.url) {
          window.location.href = json.data.url;
          return;
        }
      }
    } catch {
      /* ignore */
    } finally {
      setUpgrading(null);
    }
  }

  async function handleManageSubscription() {
    setUpgrading("manage");
    try {
      const storedToken = getStoredToken();
      const res = await fetch(`${API_BASE}/api/v1/billing/portal`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.url) {
          window.location.href = json.data.url;
          return;
        }
      }
    } catch {
      /* ignore */
    } finally {
      setUpgrading(null);
    }
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    try {
      await renameDataSource(id, renameValue.trim());
      setRenamingId(null);
      loadSources();
    } catch {
      /* ignore */
    }
  }

  async function handleDeleteSource(id: string, name: string) {
    if (!confirm(tDs("deleteConfirm", { name }))) return;
    try {
      await deleteDataSource(id);
      loadSources();
    } catch {
      /* ignore */
    }
  }

  function handleSave() {
    savePreferences({
      defaultMethod: method as "FIFO" | "LIFO" | "HIFO" | "SPECIFIC_ID",
      defaultYear: year,
      fiatCurrency,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontSize: "14px",
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: "13px",
    color: "var(--text-muted)",
    marginBottom: "8px",
    fontWeight: 500 as const,
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-subtitle">{t("subtitle")}</p>
        </div>
      </div>

      <div className="card" style={{ padding: "24px", maxWidth: "480px" }}>
        {user && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 16px",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              {user.email}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: "2px",
              }}
            >
              {user.role} {user.name ? `· ${user.name}` : ""}
            </div>
          </div>
        )}

        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>{t("defaultMethod")}</label>
          <select
            style={inputStyle}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {tTax(
                  METHOD_I18N[m] as "fifo" | "lifo" | "hifo" | "specificId",
                )}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>{t("defaultYear")}</label>
          <select
            style={inputStyle}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label style={labelStyle}>{t("fiatCurrency")}</label>
          <select
            style={inputStyle}
            value={fiatCurrency}
            onChange={(e) => setFiatCurrency(e.target.value as FiatCurrency)}
          >
            {SUPPORTED_FIATS.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} — {f.label}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          style={{ width: "100%" }}
        >
          {t("save")}
        </button>

        {saved && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px",
              textAlign: "center",
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: "var(--radius-sm)",
              color: "#22c55e",
              fontSize: "14px",
            }}
          >
            {t("saved")}
          </div>
        )}
      </div>

      {/* Billing & Subscription */}
      <div className="card" style={{ padding: "24px", marginTop: "24px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px" }}>
          {t("billingTitle")}
        </h2>

        {billingSuccess && (
          <div
            style={{
              marginBottom: "16px",
              padding: "10px 14px",
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: "var(--radius-sm)",
              color: "#22c55e",
              fontSize: "14px",
            }}
          >
            {t("paymentSuccess")}
          </div>
        )}

        {billingLoading ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>...</p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
                marginTop: "12px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                {t("currentPlan")}
              </span>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#fff",
                  background:
                    (billing?.plan ?? "FREE") === "CPA"
                      ? "#d4a017"
                      : (billing?.plan ?? "FREE") === "PRO"
                        ? "var(--accent)"
                        : "var(--text-muted)",
                }}
              >
                {t(
                  (billing?.plan ?? "FREE") === "CPA"
                    ? "planCpa"
                    : (billing?.plan ?? "FREE") === "PRO"
                      ? "planPro"
                      : "planFree",
                )}
              </span>
            </div>

            {billing && billing.plan !== "FREE" && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-muted)" }}>
                    {t("planStatus")}:{" "}
                  </span>
                  <span
                    style={{
                      color:
                        billing.status === "active"
                          ? "var(--green)"
                          : billing.status === "past_due"
                            ? "var(--red)"
                            : "var(--text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {t(
                      billing.status === "active"
                        ? "statusActive"
                        : billing.status === "past_due"
                          ? "statusPastDue"
                          : "statusCanceled",
                    )}
                  </span>
                </div>
                {billing.taxYear && (
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>
                      {t("taxYear")}:{" "}
                    </span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {billing.taxYear}
                    </span>
                  </div>
                )}
                {billing.currentPeriodEnd && (
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>
                      {t("expiresAt")}:{" "}
                    </span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {(!billing || billing.plan === "FREE") && (
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleCheckout("PRO")}
                  disabled={upgrading !== null}
                  style={{ flex: 1 }}
                >
                  {upgrading === "PRO" ? t("upgrading") : t("upgradePro")}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleCheckout("CPA")}
                  disabled={upgrading !== null}
                  style={{ flex: 1 }}
                >
                  {upgrading === "CPA" ? t("upgrading") : t("upgradeCpa")}
                </button>
              </div>
            )}

            {billing && billing.plan !== "FREE" && (
              <button
                className="btn btn-secondary"
                onClick={handleManageSubscription}
                disabled={upgrading !== null}
                style={{ width: "100%" }}
              >
                {upgrading === "manage"
                  ? t("upgrading")
                  : t("manageSubscription")}
              </button>
            )}
          </>
        )}
      </div>

      {/* Data Sources */}
      <div className="card" style={{ padding: "24px", marginTop: "24px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px" }}>
          {tDs("title")}
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            marginBottom: "16px",
          }}
        >
          {tDs("subtitle")}
        </p>

        {sources.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
            {tDs("noSources")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sources.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div style={{ flex: 1 }}>
                  {renamingId === s.id ? (
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleRename(s.id)
                        }
                        style={{
                          ...inputStyle,
                          width: "200px",
                          padding: "4px 8px",
                        }}
                        autoFocus
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => handleRename(s.id)}
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        OK
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setRenamingId(null)}
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>
                        {s.name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          marginTop: "2px",
                        }}
                      >
                        {s.type === "EXCHANGE_API"
                          ? "API"
                          : s.type === "CSV_IMPORT"
                            ? "CSV"
                            : s.type}
                        {" · "}
                        {tDs("txCount", { count: s.transactionCount })}
                        {" · "}
                        {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setRenamingId(s.id);
                      setRenameValue(s.name);
                    }}
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                  >
                    {tDs("rename")}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleDeleteSource(s.id, s.name)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      color: "var(--red)",
                    }}
                  >
                    {tDs("delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
