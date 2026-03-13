"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/i18n/navigation";

export default function AuthPage() {
  const t = useTranslations("auth");
  const t2fa = useTranslations("twoFactor");
  const router = useRouter();
  const { login, register, requiresTwoFactor, verifyTwoFactor } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 2FA login state
  const [twoFACode, setTwoFACode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
        // If requiresTwoFactor is set, we stay on this page to show 2FA form
        // Otherwise login completed, redirect
        // We check after — the state update triggers re-render
      } else {
        await register(email, password, name || undefined);
      }
      // Only redirect if not requiring 2FA (register always redirects)
      if (mode === "register") {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    }
    setSubmitting(false);
  }

  // After login completes without 2FA, redirect
  // This effect handles the case where login succeeded (no 2FA)
  const { user } = useAuth();
  if (user && !requiresTwoFactor) {
    router.push("/");
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (useRecovery) {
        await verifyTwoFactor(undefined, twoFACode);
      } else {
        await verifyTwoFactor(twoFACode, undefined);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t2fa("invalidCode"));
    }
    setSubmitting(false);
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: "14px",
  };

  if (requiresTwoFactor) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "80vh",
        }}
      >
        <div
          className="card"
          style={{ width: "100%", maxWidth: "420px", padding: "32px" }}
        >
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 700 }}>DTax</h1>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "14px",
                marginTop: "4px",
              }}
            >
              {t2fa("title")}
            </p>
          </div>

          <form
            onSubmit={handle2FASubmit}
            style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              {useRecovery ? t2fa("useRecoveryCode") : t2fa("loginPrompt")}
            </p>
            <input
              type="text"
              inputMode={useRecovery ? "text" : "numeric"}
              maxLength={useRecovery ? 20 : 6}
              required
              placeholder={
                useRecovery
                  ? t2fa("recoveryPlaceholder")
                  : t2fa("codePlaceholder")
              }
              value={twoFACode}
              onChange={(e) =>
                setTwoFACode(
                  useRecovery
                    ? e.target.value
                    : e.target.value.replace(/\D/g, ""),
                )
              }
              style={{
                ...inputStyle,
                fontFamily: "monospace",
                letterSpacing: useRecovery ? "normal" : "0.3em",
                textAlign: "center",
              }}
              autoFocus
            />

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "var(--red-bg)",
                  borderRadius: "8px",
                  color: "var(--red-light)",
                  fontSize: "13px",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || twoFACode.length === 0}
              style={{ padding: "12px", fontSize: "15px", fontWeight: 600 }}
            >
              {submitting ? t("submitting") : t2fa("verifyLogin")}
            </button>

            <button
              type="button"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setTwoFACode("");
                setError(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: "13px",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {useRecovery ? t2fa("useAuthenticator") : t2fa("useRecoveryCode")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "80vh",
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "420px", padding: "32px" }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700 }}>DTax</h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "14px",
              marginTop: "4px",
            }}
          >
            {mode === "login" ? t("loginSubtitle") : t("registerSubtitle")}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "0",
            marginBottom: "20px",
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
              background:
                mode === "login" ? "var(--accent)" : "var(--bg-secondary)",
              color: mode === "login" ? "white" : "var(--text-muted)",
            }}
          >
            {t("login")}
          </button>
          <button
            onClick={() => setMode("register")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
              background:
                mode === "register" ? "var(--accent)" : "var(--bg-secondary)",
              color: mode === "register" ? "white" : "var(--text-muted)",
            }}
          >
            {t("register")}
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          {mode === "register" && (
            <input
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            type="email"
            required
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            required
            minLength={mode === "register" ? 8 : 1}
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {mode === "login" && (
            <div style={{ textAlign: "right", marginTop: "-6px" }}>
              <Link
                href="/auth/reset"
                style={{ fontSize: "13px", color: "var(--accent)" }}
              >
                {t("forgotPassword")}
              </Link>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--red-bg)",
                borderRadius: "8px",
                color: "var(--red-light)",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ padding: "12px", fontSize: "15px", fontWeight: 600 }}
          >
            {submitting
              ? t("submitting")
              : mode === "login"
                ? t("loginBtn")
                : t("registerBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
