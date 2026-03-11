"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function VerifyEmailPage() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    fetch(`${API}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => setStatus(r.ok ? "success" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div
      className="animate-in"
      style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1rem" }}
    >
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
          {t("verifyTitle")}
        </h1>
        {status === "loading" && (
          <p style={{ color: "var(--text-secondary)" }}>
            {t("verifyChecking")}
          </p>
        )}
        {status === "success" && (
          <>
            <p
              style={{
                color: "var(--color-success, #22c55e)",
                marginBottom: "1rem",
              }}
            >
              {t("verifySuccess")}
            </p>
            <Link href="/auth" className="btn btn-primary">
              {t("loginBtn")}
            </Link>
          </>
        )}
        {status === "error" && (
          <p style={{ color: "#ef4444" }}>{t("verifyFailed")}</p>
        )}
      </div>
    </div>
  );
}
