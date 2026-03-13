"use client";

/**
 * Client switcher banner for CPA multi-client management.
 * Displays a warning bar when viewing a client's data, with a button to return to own account.
 */

import { useClient } from "@/lib/client-context";
import { useTranslations } from "next-intl";

export function ClientSwitcher() {
  const t = useTranslations("clients");
  const { activeClientId, activeClientName, setActiveClient } = useClient();

  if (!activeClientId) return null;

  return (
    <div
      style={{
        background: "var(--color-warning-bg, #fef3cd)",
        borderBottom: "2px solid var(--color-warning, #f59e0b)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "14px",
      }}
    >
      <span>
        {t("viewingAs")}: <strong>{activeClientName || activeClientId}</strong>
      </span>
      <button
        onClick={() => setActiveClient(null)}
        style={{
          background: "none",
          border: "1px solid currentColor",
          borderRadius: "4px",
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: "13px",
        }}
      >
        {t("backToOwn")}
      </button>
    </div>
  );
}
