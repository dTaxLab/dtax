"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/i18n/navigation";

export default function AuthPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
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
