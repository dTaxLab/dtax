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
import {
  getDataSources,
  renameDataSource,
  deleteDataSource,
  exportAccountData,
  requestAccountDeletion,
  cancelAccountDeletion,
  setup2FA,
  verify2FA,
  disable2FA,
  get2FAStatus,
  getAuditLogs,
  connectWallet,
  listWallets,
  syncWallet,
  disconnectWallet,
} from "@/lib/api";
import type { DataSource } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-context";
import { trackEvent } from "@/lib/analytics";

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
  const tAcc = useTranslations("account");
  const t2fa = useTranslations("twoFactor");
  const tAudit = useTranslations("audit");
  const tW = useTranslations("wallets");
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
  const [billingError, setBillingError] = useState<string | null>(null);

  // GDPR / Account state
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletionScheduledAt, setDeletionScheduledAt] = useState<string | null>(
    null,
  );
  const [accountError, setAccountError] = useState<string | null>(null);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFALoading, setTwoFALoading] = useState(true);
  const [twoFASetupData, setTwoFASetupData] = useState<{
    qrCodeUrl: string;
    secret: string;
  } | null>(null);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFARecoveryCodes, setTwoFARecoveryCodes] = useState<string[] | null>(
    null,
  );
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const [twoFASubmitting, setTwoFASubmitting] = useState(false);

  // Audit Log state
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      details: Record<string, unknown> | null;
      ipAddress: string | null;
      createdAt: string;
    }>
  >([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);

  // Wallet state
  const [wallets, setWallets] = useState<
    Array<{
      id: string;
      name: string;
      address: string;
      chain: string;
      status: string;
      lastSyncAt: string | null;
    }>
  >([]);
  const [showWalletForm, setShowWalletForm] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChain, setWalletChain] = useState("ethereum");
  const [walletLabel, setWalletLabel] = useState("");
  const [walletError, setWalletError] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const billingSuccess = searchParams.get("billing") === "success";

  async function fetchAuditLogs(offset = 0) {
    setAuditLoading(true);
    try {
      const result = await getAuditLogs({ limit: 20, offset });
      if (offset === 0) {
        setAuditLogs(result.data || []);
      } else {
        setAuditLogs((prev) => [...prev, ...(result.data || [])]);
      }
      setAuditTotal(result.total || 0);
      setAuditOffset(offset + 20);
    } catch {
      /* silently fail */
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    const prefs = getPreferences();
    setMethod(prefs.defaultMethod);
    setYear(prefs.defaultYear);
    setFiatCurrency(prefs.fiatCurrency || "USD");
    loadSources();
    loadBillingStatus();
    load2FAStatus();
    fetchAuditLogs();
    fetchWallets();
  }, []);

  async function loadSources() {
    try {
      const res = await getDataSources();
      setSources(res.data);
    } catch {
      /* ignore */
    }
  }

  async function fetchWallets() {
    try {
      const res = await listWallets();
      setWallets(Array.isArray(res) ? res : (res as any).data || []);
    } catch {
      /* ignore */
    }
  }

  async function handleConnectWallet() {
    setWalletError("");
    if (!walletAddress.trim()) return;
    try {
      await connectWallet(walletAddress, walletChain, walletLabel || undefined);
      setShowWalletForm(false);
      setWalletAddress("");
      setWalletLabel("");
      fetchWallets();
    } catch (err: any) {
      setWalletError(err?.message || "Failed to connect wallet");
    }
  }

  async function handleSyncWallet(id: string) {
    setSyncingId(id);
    try {
      await syncWallet(id);
      fetchWallets();
    } catch {
      /* ignore */
    }
    setSyncingId(null);
  }

  async function handleDisconnectWallet(id: string) {
    if (!confirm(tW("disconnectConfirm"))) return;
    try {
      await disconnectWallet(id);
      fetchWallets();
    } catch {
      /* ignore */
    }
  }

  async function load2FAStatus() {
    try {
      const res = await get2FAStatus();
      setTwoFAEnabled(res.enabled);
    } catch {
      /* ignore */
    } finally {
      setTwoFALoading(false);
    }
  }

  async function handleSetup2FA() {
    setTwoFAError(null);
    setTwoFASubmitting(true);
    try {
      const res = await setup2FA();
      setTwoFASetupData(res);
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setTwoFASubmitting(false);
    }
  }

  async function handleVerify2FA() {
    if (!twoFACode || twoFACode.length !== 6) return;
    setTwoFAError(null);
    setTwoFASubmitting(true);
    try {
      const res = await verify2FA(twoFACode);
      if (res.enabled) {
        setTwoFAEnabled(true);
        setTwoFASetupData(null);
        setTwoFACode("");
        setTwoFARecoveryCodes(res.recoveryCodes);
      }
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : t2fa("invalidCode"));
    } finally {
      setTwoFASubmitting(false);
    }
  }

  async function handleDisable2FA() {
    if (!twoFACode || twoFACode.length !== 6) return;
    setTwoFAError(null);
    setTwoFASubmitting(true);
    try {
      const res = await disable2FA(twoFACode);
      if (res.disabled) {
        setTwoFAEnabled(false);
        setTwoFACode("");
        setTwoFARecoveryCodes(null);
      }
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : t2fa("invalidCode"));
    } finally {
      setTwoFASubmitting(false);
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
    trackEvent("upgrade_click", { targetPlan: plan });
    setUpgrading(plan);
    setBillingError(null);
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
      const err = await res.json().catch(() => null);
      setBillingError(
        err?.error?.code === "STRIPE_NOT_CONFIGURED"
          ? t("stripeNotConfigured")
          : t("checkoutFailed"),
      );
    } catch {
      setBillingError(t("checkoutFailed"));
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

  async function handleExportData() {
    setExporting(true);
    setAccountError(null);
    try {
      const blob = await exportAccountData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dtax-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) return;
    setDeleting(true);
    setAccountError(null);
    try {
      const res = await requestAccountDeletion(
        deletePassword,
        deleteReason || undefined,
      );
      setDeletionScheduledAt(res.deletionScheduledAt);
      setDeletePassword("");
      setDeleteReason("");
    } catch (err) {
      setAccountError(
        err instanceof Error ? err.message : "Deletion request failed",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleCancelDeletion() {
    setCancellingDeletion(true);
    setAccountError(null);
    try {
      await cancelAccountDeletion();
      setDeletionScheduledAt(null);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingDeletion(false);
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

      <div className="settings-grid">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className="card" style={{ padding: "24px" }}>
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
                onChange={(e) =>
                  setFiatCurrency(e.target.value as FiatCurrency)
                }
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

          {/* Two-Factor Authentication */}
          <div className="card" style={{ padding: "24px" }}>
            <h2
              style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px" }}
            >
              {t2fa("title")}
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "16px",
              }}
            >
              {t2fa("description")}
            </p>

            {twoFALoading ? (
              <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                ...
              </p>
            ) : twoFARecoveryCodes ? (
              /* Recovery codes display after successful enable */
              <div>
                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(234, 179, 8, 0.1)",
                    border: "1px solid rgba(234, 179, 8, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#eab308",
                      marginBottom: "4px",
                    }}
                  >
                    {t2fa("recoveryCodes")}
                  </div>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      marginBottom: "12px",
                    }}
                  >
                    {t2fa("recoveryWarning")}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "6px",
                      fontFamily: "monospace",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                    }}
                  >
                    {twoFARecoveryCodes.map((code) => (
                      <div
                        key={code}
                        style={{
                          padding: "4px 8px",
                          background: "var(--bg-secondary)",
                          borderRadius: "4px",
                          textAlign: "center",
                        }}
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => setTwoFARecoveryCodes(null)}
                  style={{ width: "100%" }}
                >
                  OK
                </button>
              </div>
            ) : twoFAEnabled ? (
              /* 2FA is enabled — show disable flow */
              <div>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(34, 197, 94, 0.1)",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    color: "#22c55e",
                    fontSize: "14px",
                    marginBottom: "16px",
                  }}
                >
                  {t2fa("enabled")}
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    marginBottom: "12px",
                  }}
                >
                  {t2fa("disableConfirm")}
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t2fa("codePlaceholder")}
                  value={twoFACode}
                  onChange={(e) =>
                    setTwoFACode(e.target.value.replace(/\D/g, ""))
                  }
                  style={{
                    ...inputStyle,
                    fontFamily: "monospace",
                    letterSpacing: "0.3em",
                    textAlign: "center" as const,
                    marginBottom: "12px",
                  }}
                />
                <button
                  className="btn"
                  onClick={handleDisable2FA}
                  disabled={twoFASubmitting || twoFACode.length !== 6}
                  style={{
                    width: "100%",
                    background: "var(--red)",
                    color: "#fff",
                    border: "none",
                    opacity:
                      twoFASubmitting || twoFACode.length !== 6 ? 0.5 : 1,
                  }}
                >
                  {twoFASubmitting ? "..." : t2fa("disable")}
                </button>
              </div>
            ) : twoFASetupData ? (
              /* Setup flow: QR code + verify */
              <div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    marginBottom: "12px",
                  }}
                >
                  {t2fa("scanQR")}
                </p>
                <div style={{ textAlign: "center", marginBottom: "16px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={twoFASetupData.qrCodeUrl}
                    alt="2FA QR Code"
                    style={{
                      width: "200px",
                      height: "200px",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  {t2fa("manualEntry")}
                </p>
                <div
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "monospace",
                    fontSize: "13px",
                    wordBreak: "break-all",
                    color: "var(--text-primary)",
                    marginBottom: "16px",
                    textAlign: "center",
                  }}
                >
                  {twoFASetupData.secret}
                </div>
                <label style={labelStyle}>{t2fa("enterCode")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t2fa("codePlaceholder")}
                  value={twoFACode}
                  onChange={(e) =>
                    setTwoFACode(e.target.value.replace(/\D/g, ""))
                  }
                  style={{
                    ...inputStyle,
                    fontFamily: "monospace",
                    letterSpacing: "0.3em",
                    textAlign: "center" as const,
                    marginBottom: "12px",
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleVerify2FA}
                  disabled={twoFASubmitting || twoFACode.length !== 6}
                  style={{ width: "100%" }}
                >
                  {twoFASubmitting ? "..." : t2fa("verify")}
                </button>
              </div>
            ) : (
              /* 2FA not enabled — show setup button */
              <div>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-muted)",
                    fontSize: "14px",
                    marginBottom: "16px",
                  }}
                >
                  {t2fa("disabled")}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleSetup2FA}
                  disabled={twoFASubmitting}
                  style={{ width: "100%" }}
                >
                  {twoFASubmitting ? "..." : t2fa("setup")}
                </button>
              </div>
            )}

            {twoFAError && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "10px 14px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--red)",
                  fontSize: "13px",
                }}
              >
                {twoFAError}
              </div>
            )}
          </div>
        </div>
        {/* end left column */}

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Billing & Subscription */}
          <div className="card" style={{ padding: "24px" }}>
            <h2
              style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px" }}
            >
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
              <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                ...
              </p>
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
                  <span
                    style={{ fontSize: "13px", color: "var(--text-muted)" }}
                  >
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
                          {new Date(
                            billing.currentPeriodEnd,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {(!billing || billing.plan === "FREE") && (
                  <div
                    style={{ display: "flex", gap: "10px", marginTop: "8px" }}
                  >
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

                {billingError && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--red)",
                      fontSize: "13px",
                    }}
                  >
                    {billingError}
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
          <div className="card" style={{ padding: "24px" }}>
            <h2
              style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px" }}
            >
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
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
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
          {/* Connected Wallets */}
          <div className="card" style={{ padding: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    marginBottom: "4px",
                  }}
                >
                  {tW("title")}
                </h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  {tW("subtitle")}
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowWalletForm(!showWalletForm)}
                style={{ fontSize: "13px", padding: "6px 14px" }}
              >
                {tW("connect")}
              </button>
            </div>

            {showWalletForm && (
              <div
                style={{
                  padding: "16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <select
                    value={walletChain}
                    onChange={(e) => setWalletChain(e.target.value)}
                    style={{ ...inputStyle, padding: "8px 12px" }}
                  >
                    {[
                      "ethereum",
                      "solana",
                      "polygon",
                      "bsc",
                      "arbitrum",
                      "optimism",
                    ].map((c) => (
                      <option key={c} value={c}>
                        {tW(c as any)}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder={tW("enterAddress")}
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    style={{ ...inputStyle, padding: "8px 12px" }}
                  />
                  <input
                    placeholder={tW("label")}
                    value={walletLabel}
                    onChange={(e) => setWalletLabel(e.target.value)}
                    style={{ ...inputStyle, padding: "8px 12px" }}
                  />
                  {walletError && (
                    <p
                      style={{ color: "var(--color-error)", fontSize: "13px" }}
                    >
                      {walletError}
                    </p>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={handleConnectWallet}
                    style={{
                      alignSelf: "flex-start",
                      fontSize: "13px",
                      padding: "6px 14px",
                    }}
                  >
                    {tW("connectWallet")}
                  </button>
                </div>
              </div>
            )}

            {wallets.length === 0 ? (
              <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                {tW("noWallets")}
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {wallets.map((w) => (
                  <div
                    key={w.id}
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
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>
                        {w.name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          marginTop: "2px",
                          fontFamily: "monospace",
                        }}
                      >
                        {w.address.substring(0, 8)}...
                        {w.address.substring(w.address.length - 6)}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          marginTop: "2px",
                        }}
                      >
                        {tW(w.chain as any)}{" "}
                        {w.lastSyncAt
                          ? `· ${tW("lastSync")}: ${new Date(w.lastSyncAt).toLocaleDateString()}`
                          : ""}
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleSyncWallet(w.id)}
                      disabled={syncingId === w.id}
                      style={{ fontSize: "12px", padding: "4px 10px" }}
                    >
                      {syncingId === w.id ? tW("syncing") : tW("sync")}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleDisconnectWallet(w.id)}
                      style={{
                        fontSize: "12px",
                        padding: "4px 10px",
                        color: "var(--color-error)",
                      }}
                    >
                      {tW("disconnect")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Data & Privacy (GDPR) */}
          <div className="card" style={{ padding: "24px" }}>
            <h2
              style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px" }}
            >
              {tAcc("dataPrivacy")}
            </h2>

            {/* Export Data */}
            <div style={{ marginTop: "16px", marginBottom: "24px" }}>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "12px",
                }}
              >
                {tAcc("exportDescription")}
              </p>
              <button
                className="btn btn-secondary"
                onClick={handleExportData}
                disabled={exporting}
                style={{ width: "100%" }}
              >
                {exporting ? tAcc("exportProcessing") : tAcc("exportData")}
              </button>
              {exportDone && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px",
                    textAlign: "center",
                    background: "rgba(34, 197, 94, 0.1)",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    color: "#22c55e",
                    fontSize: "13px",
                  }}
                >
                  {tAcc("exportSuccess")}
                </div>
              )}
            </div>

            {/* Delete Account */}
            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "20px",
              }}
            >
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  marginBottom: "12px",
                  color: "var(--red)",
                }}
              >
                {tAcc("deleteAccount")}
              </h3>

              {deletionScheduledAt ? (
                <div>
                  <div
                    style={{
                      padding: "12px 16px",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--red)",
                        marginBottom: "4px",
                      }}
                    >
                      {tAcc("deletionPending")}
                    </div>
                    <div
                      style={{ fontSize: "13px", color: "var(--text-muted)" }}
                    >
                      {tAcc("deletionDate")}{" "}
                      {new Date(deletionScheduledAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={handleCancelDeletion}
                    disabled={cancellingDeletion}
                    style={{ width: "100%" }}
                  >
                    {tAcc("cancelDeletion")}
                  </button>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      padding: "12px 16px",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "16px",
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      lineHeight: "1.5",
                    }}
                  >
                    {tAcc("deleteWarning")}
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label style={labelStyle}>
                      {tAcc("deleteConfirmPassword")}
                    </label>
                    <input
                      type="password"
                      style={inputStyle}
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={labelStyle}>{tAcc("deleteReason")}</label>
                    <textarea
                      style={{
                        ...inputStyle,
                        minHeight: "60px",
                        resize: "vertical" as const,
                      }}
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      placeholder={tAcc("deleteReasonPlaceholder")}
                    />
                  </div>

                  <button
                    className="btn"
                    onClick={handleDeleteAccount}
                    disabled={deleting || !deletePassword}
                    style={{
                      width: "100%",
                      background: "var(--red)",
                      color: "#fff",
                      border: "none",
                      opacity: deleting || !deletePassword ? 0.5 : 1,
                    }}
                  >
                    {deleting ? "..." : tAcc("deleteButton")}
                  </button>
                </div>
              )}

              {accountError && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--red)",
                    fontSize: "13px",
                  }}
                >
                  {accountError}
                </div>
              )}
            </div>
          </div>
          {/* Activity Log */}
          <div className="card" style={{ padding: "24px" }}>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "16px",
              }}
            >
              {tAudit("title")}
            </h2>

            {auditLogs.length === 0 ? (
              <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                {tAudit("noLogs")}
              </p>
            ) : (
              <div>
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      padding: "8px 0",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                    <span style={{ marginLeft: 8, fontWeight: 600 }}>
                      {tAudit(log.action as Parameters<typeof tAudit>[0])}
                    </span>
                    <span style={{ marginLeft: 8 }}>
                      {log.entityType}
                      {log.entityId && ` #${log.entityId.slice(0, 8)}`}
                    </span>
                  </div>
                ))}
                {auditLogs.length < auditTotal && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => fetchAuditLogs(auditOffset)}
                    disabled={auditLoading}
                    style={{ width: "100%", marginTop: "12px" }}
                  >
                    {tAudit("showMore")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {/* end right column */}
      </div>
      {/* end grid */}
    </div>
  );
}
