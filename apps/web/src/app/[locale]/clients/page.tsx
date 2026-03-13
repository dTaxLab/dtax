"use client";

/**
 * CPA Client Management page.
 * Lists invited clients, allows inviting new clients, revoking access,
 * editing notes, and switching to view a client's data.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import {
  listClients,
  inviteClient,
  revokeClient,
  updateClientNotes,
} from "@/lib/api";

interface Client {
  id: string;
  email: string;
  name: string | null;
  status: string;
  userId: string | null;
  notes: string | null;
  createdAt: string;
}

export default function ClientsPage() {
  const t = useTranslations("clients");
  const { user } = useAuth();
  const { setActiveClient } = useClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  // Notes editing
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listClients();
      setClients(data as unknown as Client[]);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load clients";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviteLoading(true);
    try {
      await inviteClient(inviteEmail, inviteName || undefined);
      setInviteMessage(t("inviteSent"));
      setInviteEmail("");
      setInviteName("");
      setShowInvite(false);
      fetchClients();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send invitation";
      setInviteMessage(message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevoke = async (clientId: string) => {
    if (!confirm(t("revokeConfirm"))) return;
    try {
      await revokeClient(clientId);
      fetchClients();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const handleSaveNotes = async (clientId: string) => {
    try {
      await updateClientNotes(clientId, notesText);
      setEditingNotes(null);
      fetchClients();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const handleSwitchToClient = (client: Client) => {
    if (client.status === "ACTIVE" && client.userId) {
      setActiveClient(client.id, client.name || client.email);
      window.location.href = window.location.pathname.replace(
        "/clients",
        "/dashboard",
      );
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "#f59e0b",
      ACTIVE: "#10b981",
      REVOKED: "#ef4444",
    };
    const labels: Record<string, string> = {
      PENDING: t("pending"),
      ACTIVE: t("active"),
      REVOKED: t("revoked"),
    };
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 600,
          color: "#fff",
          background: colors[status] || "#6b7280",
        }}
      >
        {labels[status] || status}
      </span>
    );
  };

  // Suppress unused variable warning — user is available for future CPA guard checks
  void user;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{t("title")}</h1>
        <button
          onClick={() => setShowInvite(!showInvite)}
          style={{
            background: "var(--color-accent, #3b82f6)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {t("invite")}
        </button>
      </div>

      {/* Invite Form */}
      {showInvite && (
        <div
          style={{
            background: "var(--color-card-bg, #f9fafb)",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder={t("email")}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border, #d1d5db)",
              }}
            />
            <input
              type="text"
              placeholder={t("name")}
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              style={{
                flex: 1,
                minWidth: 150,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border, #d1d5db)",
              }}
            />
            <button
              onClick={handleInvite}
              disabled={inviteLoading || !inviteEmail}
              style={{
                background: "var(--color-accent, #3b82f6)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                cursor: inviteLoading ? "not-allowed" : "pointer",
                opacity: inviteLoading ? 0.7 : 1,
              }}
            >
              {inviteLoading ? "..." : t("invite")}
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {inviteMessage && (
        <div
          style={{
            padding: "8px 16px",
            marginBottom: 16,
            background: "#d1fae5",
            borderRadius: 6,
            color: "#065f46",
          }}
        >
          {inviteMessage}
          <button
            onClick={() => setInviteMessage(null)}
            style={{
              float: "right",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            x
          </button>
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "8px 16px",
            marginBottom: 16,
            background: "#fee2e2",
            borderRadius: 6,
            color: "#991b1b",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              float: "right",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Client List */}
      {loading ? (
        <p>Loading...</p>
      ) : clients.length === 0 ? (
        <p
          style={{
            color: "var(--color-muted, #6b7280)",
            textAlign: "center",
            padding: 40,
          }}
        >
          {t("noClients")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clients.map((client) => (
            <div
              key={client.id}
              style={{
                border: "1px solid var(--color-border, #e5e7eb)",
                borderRadius: 8,
                padding: 16,
                background: "var(--color-card-bg, #fff)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div>
                  <strong style={{ fontSize: 16 }}>
                    {client.name || client.email}
                  </strong>
                  {client.name && (
                    <span
                      style={{
                        marginLeft: 8,
                        color: "var(--color-muted, #6b7280)",
                        fontSize: 13,
                      }}
                    >
                      {client.email}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {statusBadge(client.status)}
                  {client.status === "ACTIVE" && client.userId && (
                    <button
                      onClick={() => handleSwitchToClient(client)}
                      style={{
                        background: "var(--color-accent, #3b82f6)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "4px 12px",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {t("switchTo")}
                    </button>
                  )}
                  {client.status !== "REVOKED" && (
                    <button
                      onClick={() => handleRevoke(client.id)}
                      style={{
                        background: "none",
                        color: "#ef4444",
                        border: "1px solid #ef4444",
                        borderRadius: 4,
                        padding: "4px 12px",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {t("revoked")}
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginTop: 8 }}>
                {editingNotes === client.id ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      style={{
                        flex: 1,
                        padding: 8,
                        borderRadius: 4,
                        border: "1px solid var(--color-border, #d1d5db)",
                        minHeight: 60,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <button
                        onClick={() => handleSaveNotes(client.id)}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 4,
                          background: "var(--color-accent, #3b82f6)",
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setEditingNotes(null)}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 4,
                          background: "none",
                          border: "1px solid var(--color-border, #d1d5db)",
                          cursor: "pointer",
                        }}
                      >
                        x
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    onClick={() => {
                      setEditingNotes(client.id);
                      setNotesText(client.notes || "");
                    }}
                    style={{
                      color: "var(--color-muted, #9ca3af)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {client.notes || `+ ${t("notes")}`}
                  </p>
                )}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--color-muted, #9ca3af)",
                }}
              >
                {new Date(client.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
