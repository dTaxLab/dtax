"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface AdminStats {
  users: number;
  transactions: number;
  dataSources: number;
  taxReports: number;
}

export default function AdminPage() {
  const t = useTranslations("admin");
  const { user, token, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !user || user.role !== "ADMIN") {
      setLoading(false);
      return;
    }
    fetch(`${API}/api/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setStats(d.data))
      .catch(() => setError(t("fetchError")))
      .finally(() => setLoading(false));
  }, [token, user]);

  if (authLoading || loading) {
    return (
      <div className="container animate-in">
        <p style={{ textAlign: "center", padding: "2rem" }}>{t("loading")}</p>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="container animate-in">
        <div
          className="card"
          style={{ textAlign: "center", padding: "3rem 2rem" }}
        >
          <h1
            style={{
              fontSize: "3rem",
              color: "var(--text-muted)",
              marginBottom: "0.5rem",
            }}
          >
            403
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>{t("accessDenied")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container animate-in">
        <div
          className="card"
          style={{ textAlign: "center", padding: "2rem", color: "#ef4444" }}
        >
          {error}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: t("totalUsers"), value: stats?.users ?? 0 },
    { label: t("totalTransactions"), value: stats?.transactions ?? 0 },
    { label: t("totalDataSources"), value: stats?.dataSources ?? 0 },
    { label: t("totalTaxReports"), value: stats?.taxReports ?? 0 },
  ];

  return (
    <div className="container animate-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", color: "var(--text-primary)" }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
          {t("subtitle")}
        </p>
      </div>

      <div className="grid-3" style={{ marginBottom: "2rem" }}>
        {statCards.map((card) => (
          <div
            key={card.label}
            className="card"
            style={{ textAlign: "center", padding: "1.5rem" }}
          >
            <div
              style={{
                fontSize: "2.5rem",
                fontWeight: 700,
                color: "var(--accent)",
                lineHeight: 1.2,
              }}
            >
              {card.value.toLocaleString()}
            </div>
            <div
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                marginTop: "0.5rem",
              }}
            >
              {card.label}
            </div>
          </div>
        ))}
      </div>

      <div>
        <Link href="/admin/users" className="btn btn-primary">
          {t("manageUsers")}
        </Link>
      </div>
    </div>
  );
}
