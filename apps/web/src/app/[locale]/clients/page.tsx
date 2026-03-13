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
  batchReport,
} from "@/lib/api";
import type { BatchReportItem } from "@/lib/api";

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

  // Batch report state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchYear, setBatchYear] = useState(new Date().getFullYear() - 1);
  const [batchMethod, setBatchMethod] = useState("FIFO");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchReportItem[] | null>(
    null,
  );

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

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeClients = clients.filter(
    (c) => c.status === "ACTIVE" && c.userId,
  );

  const handleSelectAll = () => {
    if (selectedIds.size === activeClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeClients.map((c) => c.id)));
    }
  };

  const handleBatchReport = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    setBatchResults(null);
    try {
      const res = await batchReport(
        Array.from(selectedIds),
        batchYear,
        batchMethod,
      );
      setBatchResults(res.data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Batch report failed";
      setError(message);
    } finally {
      setBatchLoading(false);
    }
  };

  const formatUsd = (v?: number) =>
    v !== undefined
      ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "-";

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

      {/* Batch Report Controls */}
      {activeClients.length > 0 && (
        <div
          style={{
            background: "var(--color-card-bg, #f9fafb)",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={
                  selectedIds.size === activeClients.length &&
                  activeClients.length > 0
                }
                onChange={handleSelectAll}
              />
              {t("selectAll") || "Select All"}
            </label>
            <select
              value={batchYear}
              onChange={(e) => setBatchYear(Number(e.target.value))}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border, #d1d5db)",
              }}
            >
              {Array.from(
                { length: 5 },
                (_, i) => new Date().getFullYear() - 1 - i,
              ).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={batchMethod}
              onChange={(e) => setBatchMethod(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border, #d1d5db)",
              }}
            >
              <option value="FIFO">FIFO</option>
              <option value="LIFO">LIFO</option>
              <option value="HIFO">HIFO</option>
            </select>
            <button
              onClick={handleBatchReport}
              disabled={batchLoading || selectedIds.size === 0}
              style={{
                background:
                  selectedIds.size > 0
                    ? "var(--color-accent, #3b82f6)"
                    : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                cursor:
                  batchLoading || selectedIds.size === 0
                    ? "not-allowed"
                    : "pointer",
                fontWeight: 600,
                opacity: batchLoading ? 0.7 : 1,
              }}
            >
              {batchLoading
                ? "..."
                : `${t("batchReport") || "Batch Report"} (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Batch Report Results */}
      {batchResults && (
        <div
          style={{
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: 8,
            marginBottom: 16,
            overflow: "auto",
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
          >
            <thead>
              <tr style={{ background: "var(--color-card-bg, #f3f4f6)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>
                  {t("name") || "Client"}
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  {t("transactions") || "Txns"}
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  {t("shortTermGL") || "Short-Term"}
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  {t("longTermGL") || "Long-Term"}
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  {t("netGainLoss") || "Net G/L"}
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  {t("income") || "Income"}
                </th>
              </tr>
            </thead>
            <tbody>
              {batchResults.map((r) => (
                <tr
                  key={r.clientId}
                  style={{
                    borderTop: "1px solid var(--color-border, #e5e7eb)",
                  }}
                >
                  {r.error ? (
                    <>
                      <td style={{ padding: "8px 12px" }}>{r.clientId}</td>
                      <td
                        colSpan={5}
                        style={{ padding: "8px 12px", color: "#ef4444" }}
                      >
                        {r.error}
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: "8px 12px" }}>
                        {r.clientName || r.clientEmail || r.clientId}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        {r.transactionCount}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          color:
                            (r.shortTermGL ?? 0) >= 0 ? "#10b981" : "#ef4444",
                        }}
                      >
                        {formatUsd(r.shortTermGL)}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          color:
                            (r.longTermGL ?? 0) >= 0 ? "#10b981" : "#ef4444",
                        }}
                      >
                        {formatUsd(r.longTermGL)}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontWeight: 600,
                          color:
                            (r.netGainLoss ?? 0) >= 0 ? "#10b981" : "#ef4444",
                        }}
                      >
                        {formatUsd(r.netGainLoss)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        {formatUsd(r.totalIncome)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {client.status === "ACTIVE" && client.userId && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(client.id)}
                      onChange={() => toggleSelection(client.id)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                  )}
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
