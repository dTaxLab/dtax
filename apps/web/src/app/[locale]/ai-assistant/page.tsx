"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  sendChatMessage,
  type ChatConversation,
  type ChatMessageData,
} from "@/lib/api";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

export default function AiAssistantPage() {
  const t = useTranslations("chat");

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    listConversations()
      .then((res) => setConversations(res.data))
      .catch(() => setError(t("loadError")));
  }, [t]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    getConversation(activeId)
      .then((res) => {
        setMessages(res.data.messages);
        setTimeout(scrollToBottom, 100);
      })
      .catch(() => setError(t("loadError")))
      .finally(() => setLoading(false));
  }, [activeId, t, scrollToBottom]);

  async function handleNewConversation() {
    try {
      const res = await createConversation();
      setConversations((prev) => [{ ...res.data, messageCount: 0 }, ...prev]);
      setActiveId(res.data.id);
      setMessages([]);
    } catch {
      setError(t("error"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch {
      setError(t("deleteError"));
    }
  }

  async function handleSend(content: string) {
    if (!activeId || sending) return;
    setError(null);
    setSending(true);

    const tempUserMsg: ChatMessageData = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setTimeout(scrollToBottom, 50);

    try {
      const res = await sendChatMessage(activeId, content);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        res.data.userMessage,
        res.data.assistantMessage,
      ]);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                title:
                  c.messageCount === 0
                    ? content.length > 60
                      ? content.slice(0, 57) + "..."
                      : content
                    : c.title,
                messageCount: c.messageCount + 2,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      const apiErr = err as { code?: string };
      if (apiErr.code === "CHAT_QUOTA_EXCEEDED") {
        setError(t("quotaExceeded"));
      } else {
        setError(t("error"));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 16 }}>{t("title")}</h1>

      {error && (
        <div
          className="card"
          style={{ borderColor: "var(--red)", marginBottom: 16 }}
        >
          <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: 8,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--red)",
              }}
            >
              &times;
            </button>
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, minHeight: "70vh" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleNewConversation}
            style={{ width: "100%", marginBottom: 8 }}
          >
            + {t("newConversation")}
          </button>

          {conversations.length === 0 && !loading && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, padding: 8 }}>
              {t("noConversations")}
            </p>
          )}

          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="card"
              onClick={() => setActiveId(conv.id)}
              style={{
                cursor: "pointer",
                padding: "10px 12px",
                borderColor: activeId === conv.id ? "var(--accent)" : undefined,
                background:
                  activeId === conv.id
                    ? "var(--bg-hover, rgba(99,102,241,0.08))"
                    : undefined,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {conv.title}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {conv.messageCount} msgs
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(conv.id);
                  }}
                  aria-label="Delete conversation"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: 16,
                    padding: "0 4px",
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Main chat area */}
        <div
          className="card"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: 0,
            overflow: "hidden",
          }}
        >
          {activeId ? (
            <>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 16,
                }}
              >
                <MessageList messages={messages} loading={sending} />
                <div ref={messagesEndRef} />
              </div>
              <div
                style={{ borderTop: "1px solid var(--border)", padding: 12 }}
              >
                <ChatInput onSend={handleSend} disabled={sending} />
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <p style={{ color: "var(--text-muted)" }}>
                {t("noConversations")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
