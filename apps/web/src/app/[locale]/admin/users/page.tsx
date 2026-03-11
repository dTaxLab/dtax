"use client";

/**
 * Admin User Management page.
 * Lists all users with pagination, search, role toggle, and inline detail expansion.
 * Requires ADMIN role — shows 403 for non-admin users.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  _count: {
    transactions: number;
    dataSources: number;
  };
}

interface AdminUserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    transactions: number;
    dataSources: number;
    taxLots: number;
    taxReports: number;
  };
}

interface UserListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZES = [10, 20, 50];

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const { user, token, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meta, setMeta] = useState<UserListMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (p: number, l: number) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/admin/users?page=${p}&limit=${l}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setUsers(json.data);
        setMeta(json.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!authLoading && token && user?.role === "ADMIN") {
      fetchUsers(page, limit);
    }
  }, [authLoading, token, user?.role, page, limit, fetchUsers]);

  async function fetchDetail(userId: string) {
    if (!token) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetail(json.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleExpand(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
      setDetail(null);
    } else {
      setExpandedId(userId);
      fetchDetail(userId);
    }
  }

  async function handleRoleToggle(targetUser: AdminUser) {
    if (!token) return;
    const newRole = targetUser.role === "ADMIN" ? "USER" : "ADMIN";
    const confirmed = window.confirm(
      t("confirmRoleChange", {
        email: targetUser.email,
        role: newRole,
      }),
    );
    if (!confirmed) return;

    setRoleUpdating(targetUser.id);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/admin/users/${targetUser.id}/role`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: newRole }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh list
      await fetchUsers(page, limit);
      // Refresh detail if expanded
      if (expandedId === targetUser.id) {
        fetchDetail(targetUser.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setRoleUpdating(null);
    }
  }

  // Client-side search filter on current page
  const filteredUsers = search.trim()
    ? users.filter((u) =>
        u.email.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : users;

  // 403 for non-admin
  if (!authLoading && user && user.role !== "ADMIN") {
    return (
      <div className="animate-in">
        <div
          className="card"
          style={{ padding: "48px", textAlign: "center", marginTop: "40px" }}
        >
          <h1
            style={{
              fontSize: "48px",
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            403
          </h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
            {t("forbidden")}
          </p>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="animate-in" style={{ padding: "40px" }}>
        <p style={{ color: "var(--text-muted)" }}>{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("userManagement")}</h1>
          <p className="page-subtitle">
            {t("userCount", { count: meta.total })}
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "16px", maxWidth: "360px" }}>
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontSize: "14px",
          }}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 16px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--radius-sm)",
            color: "#ef4444",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>{t("loading")}</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="card" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>{t("noUsers")}</p>
        </div>
      ) : (
        <div className="table-container">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>{t("email")}</th>
                <th style={thStyle}>{t("name")}</th>
                <th style={thStyle}>{t("role")}</th>
                <th style={thStyle}>{t("registered")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>
                  {t("txCount")}
                </th>
                <th style={{ ...thStyle, textAlign: "right" }}>
                  {t("dsCount")}
                </th>
                <th style={{ ...thStyle, textAlign: "center" }}>
                  {t("changeRole")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <UserRow
                  key={u.id}
                  adminUser={u}
                  currentUserId={user?.id ?? ""}
                  expanded={expandedId === u.id}
                  detail={expandedId === u.id ? detail : null}
                  detailLoading={expandedId === u.id && detailLoading}
                  roleUpdating={roleUpdating === u.id}
                  onExpand={() => handleExpand(u.id)}
                  onRoleToggle={() => handleRoleToggle(u)}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "16px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              color: "var(--text-secondary)",
            }}
          >
            <span>
              {t("page")} {meta.page} {t("of")} {meta.totalPages}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontSize: "13px",
              }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} / {t("page").toLowerCase()}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: "6px 12px", fontSize: "13px" }}
            >
              &laquo;
            </button>
            <button
              className="btn btn-secondary"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{ padding: "6px 12px", fontSize: "13px" }}
            >
              &raquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Sub-component ---------- */

interface UserRowProps {
  adminUser: AdminUser;
  currentUserId: string;
  expanded: boolean;
  detail: AdminUserDetail | null;
  detailLoading: boolean;
  roleUpdating: boolean;
  onExpand: () => void;
  onRoleToggle: () => void;
  t: ReturnType<typeof useTranslations>;
}

function UserRow({
  adminUser,
  currentUserId,
  expanded,
  detail,
  detailLoading,
  roleUpdating,
  onExpand,
  onRoleToggle,
  t,
}: UserRowProps) {
  const isSelf = adminUser.id === currentUserId;

  return (
    <>
      <tr style={{ borderBottom: "1px solid var(--border)" }}>
        <td style={tdStyle}>
          <button
            onClick={onExpand}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: "14px",
              padding: 0,
              textDecoration: "underline",
              textAlign: "left",
            }}
          >
            {adminUser.email}
          </button>
        </td>
        <td style={tdStyle}>{adminUser.name || "—"}</td>
        <td style={tdStyle}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              background:
                adminUser.role === "ADMIN"
                  ? "rgba(234, 179, 8, 0.15)"
                  : "rgba(99, 102, 241, 0.15)",
              color:
                adminUser.role === "ADMIN"
                  ? "var(--yellow, #eab308)"
                  : "var(--accent)",
            }}
          >
            {adminUser.role}
          </span>
        </td>
        <td style={tdStyle}>
          {new Date(adminUser.createdAt).toLocaleDateString()}
        </td>
        <td style={{ ...tdStyle, textAlign: "right" }}>
          {adminUser._count.transactions}
        </td>
        <td style={{ ...tdStyle, textAlign: "right" }}>
          {adminUser._count.dataSources}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <button
            className="btn btn-secondary"
            disabled={isSelf || roleUpdating}
            onClick={onRoleToggle}
            title={isSelf ? t("selfDemotion") : ""}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              opacity: isSelf ? 0.4 : 1,
            }}
          >
            {roleUpdating
              ? "..."
              : adminUser.role === "ADMIN"
                ? t("demote")
                : t("promote")}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: "12px 16px" }}>
            {detailLoading ? (
              <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                {t("loading")}
              </span>
            ) : detail ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "12px",
                  padding: "12px 16px",
                  background: "var(--bg-surface)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                }}
              >
                <DetailItem label={t("email")} value={detail.email} />
                <DetailItem label={t("name")} value={detail.name || "—"} />
                <DetailItem label={t("role")} value={detail.role} />
                <DetailItem
                  label={t("registered")}
                  value={new Date(detail.createdAt).toLocaleString()}
                />
                <DetailItem
                  label={t("lastUpdated")}
                  value={new Date(detail.updatedAt).toLocaleString()}
                />
                <DetailItem
                  label={t("txCount")}
                  value={String(detail._count.transactions)}
                />
                <DetailItem
                  label={t("dsCount")}
                  value={String(detail._count.dataSources)}
                />
                <DetailItem
                  label={t("taxLots")}
                  value={String(detail._count.taxLots)}
                />
                <DetailItem
                  label={t("taxReports")}
                  value={String(detail._count.taxReports)}
                />
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>
        {label}
      </div>
      <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: "14px",
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
};
