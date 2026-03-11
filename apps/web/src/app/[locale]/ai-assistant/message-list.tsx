"use client";

import { useTranslations } from "next-intl";
import type { ChatMessageData } from "@/lib/api";

const TOOL_LABELS: Record<string, string> = {
  get_tax_summary: "tax summary",
  get_transaction_stats: "transaction stats",
  search_transactions: "transactions",
  get_risk_summary: "risk scan",
};

export function MessageList({
  messages,
  loading,
}: {
  messages: ChatMessageData[];
  loading: boolean;
}) {
  const t = useTranslations("chat");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: msg.role === "user" ? "flex-end" : "flex-start",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 4,
            }}
          >
            {msg.role === "user" ? "You" : "AI Assistant"}
          </span>
          <div
            style={{
              maxWidth: "80%",
              padding: "10px 14px",
              borderRadius: 12,
              fontSize: 14,
              lineHeight: 1.5,
              background:
                msg.role === "user"
                  ? "var(--accent)"
                  : "var(--bg-secondary, var(--card-bg, #f5f5f5))",
              color: msg.role === "user" ? "white" : "var(--text)",
            }}
          >
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {msg.toolCalls.map((tc, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "rgba(99,102,241,0.15)",
                      color: "var(--accent)",
                      marginRight: 4,
                      marginBottom: 4,
                    }}
                  >
                    {t("toolCall", { tool: TOOL_LABELS[tc.name] || tc.name })}
                  </span>
                ))}
              </div>
            )}
            {msg.content.split("\n").map((line, i) => (
              <p key={i} style={{ margin: "2px 0" }}>
                {line || "\u00A0"}
              </p>
            ))}
          </div>
        </div>
      ))}
      {loading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 4,
            }}
          >
            AI Assistant
          </span>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              fontSize: 14,
              background: "var(--bg-secondary, var(--card-bg, #f5f5f5))",
              color: "var(--text-muted)",
            }}
          >
            {t("thinking")}
          </div>
        </div>
      )}
    </div>
  );
}
