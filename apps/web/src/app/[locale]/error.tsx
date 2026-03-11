"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  return (
    <div
      style={{
        padding: "80px 0",
        textAlign: "center",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          lineHeight: "64px",
          borderRadius: "50%",
          background: "var(--red-bg)",
          color: "var(--red)",
          fontSize: "28px",
          margin: "0 auto 24px",
        }}
      >
        !
      </div>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          marginBottom: "8px",
          color: "var(--text-primary)",
        }}
      >
        {t("unexpectedError")}
      </h1>
      <p
        style={{
          fontSize: "14px",
          color: "var(--text-muted)",
          marginBottom: "8px",
        }}
      >
        {t("unexpectedErrorHint")}
      </p>
      {error.message && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono, monospace)",
            padding: "8px 16px",
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "24px",
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </p>
      )}
      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={reset}>
          {t("retry")}
        </button>
        <a
          href="/"
          className="btn btn-secondary"
          style={{ textDecoration: "none" }}
        >
          {t("goHome")}
        </a>
      </div>
    </div>
  );
}
