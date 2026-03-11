"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const token = params.get("token");

  if (token) {
    return <ResetForm token={token} />;
  }
  return <ForgotForm />;
}

function ForgotForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${API}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="animate-in"
      style={{ maxWidth: 420, margin: "0 auto", padding: "3rem 1rem" }}
    >
      <div className="card" style={{ padding: "2rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            marginBottom: "0.5rem",
            textAlign: "center",
          }}
        >
          {t("forgotTitle")}
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            textAlign: "center",
            marginBottom: "1.5rem",
            fontSize: "0.875rem",
          }}
        >
          {t("forgotSubtitle")}
        </p>

        {sent ? (
          <p
            style={{
              color: "var(--color-success, #22c55e)",
              textAlign: "center",
            }}
          >
            {t("forgotSuccess")}
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              required
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ width: "100%" }}
            >
              {submitting ? t("submitting") : t("forgotSubmit")}
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <Link
            href="/auth"
            style={{ fontSize: "13px", color: "var(--accent)" }}
          >
            {t("loginBtn")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="animate-in"
      style={{ maxWidth: 420, margin: "0 auto", padding: "3rem 1rem" }}
    >
      <div className="card" style={{ padding: "2rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            marginBottom: "1.5rem",
            textAlign: "center",
          }}
        >
          {t("resetTitle")}
        </h1>

        {status === "success" ? (
          <>
            <p
              style={{
                color: "var(--color-success, #22c55e)",
                textAlign: "center",
                marginBottom: "1rem",
              }}
            >
              {t("resetSuccess")}
            </p>
            <Link
              href="/auth"
              className="btn btn-primary"
              style={{ display: "block", textAlign: "center" }}
            >
              {t("loginBtn")}
            </Link>
          </>
        ) : status === "error" ? (
          <p style={{ color: "#ef4444", textAlign: "center" }}>
            {t("resetInvalidToken")}
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              required
              minLength={8}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ width: "100%" }}
            >
              {submitting ? t("submitting") : t("resetSubmit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
