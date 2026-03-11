"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (content: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput("");
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t("placeholder")}
        disabled={disabled}
        maxLength={10000}
        style={{
          flex: 1,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: 14,
          outline: "none",
        }}
      />
      <button
        className="btn btn-primary"
        type="submit"
        disabled={disabled || !input.trim()}
      >
        {t("send")}
      </button>
    </form>
  );
}
