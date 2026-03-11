"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          background: "#0a0e1a",
          color: "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <div
          style={{ textAlign: "center", maxWidth: "480px", padding: "24px" }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              lineHeight: "64px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              fontSize: "28px",
              margin: "0 auto 24px",
            }}
          >
            !
          </div>
          <h1
            style={{ fontSize: "22px", fontWeight: 700, marginBottom: "8px" }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              marginBottom: "8px",
            }}
          >
            A critical error occurred. Please try again.
          </p>
          {error.message && (
            <p
              style={{
                fontSize: "13px",
                color: "#64748b",
                fontFamily: "monospace",
                padding: "8px 16px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "8px",
                marginBottom: "24px",
                wordBreak: "break-word",
              }}
            >
              {error.message}
            </p>
          )}
          <div
            style={{ display: "flex", gap: "12px", justifyContent: "center" }}
          >
            <button
              onClick={reset}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                background: "#6366f1",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid rgba(255,255,255,0.06)",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
