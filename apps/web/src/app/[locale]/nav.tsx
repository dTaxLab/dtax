"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";

export function LocaleNav({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const currentLocale = useLocale();
  const otherLocale = currentLocale === "en" ? "zh" : "en";
  const otherLabel = currentLocale === "en" ? "中文" : "EN";
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <nav className="nav" aria-label="Main navigation">
      <Link href="/" className="nav-brand" aria-label="DTax Home">
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          aria-hidden="true"
        >
          <rect width="28" height="28" rx="8" fill="#6366f1" />
          <text
            x="6"
            y="20"
            fill="white"
            fontSize="16"
            fontWeight="bold"
            fontFamily="Inter"
          >
            D
          </text>
        </svg>
        <span>DTax</span>
      </Link>
      <div className="nav-links">
        <Link
          href="/"
          className={`nav-link ${pathname === "/" ? "active" : ""}`}
        >
          {t("dashboard")}
        </Link>
        <Link
          href="/transactions"
          className={`nav-link ${pathname === "/transactions" ? "active" : ""}`}
        >
          {t("transactions")}
        </Link>
        <Link
          href="/transfers"
          className={`nav-link ${pathname === "/transfers" ? "active" : ""}`}
        >
          {t("transfers")}
        </Link>
        <Link
          href="/tax"
          className={`nav-link ${pathname === "/tax" ? "active" : ""}`}
        >
          {t("taxReport")}
        </Link>
        <Link
          href="/portfolio"
          className={`nav-link ${pathname === "/portfolio" ? "active" : ""}`}
        >
          {t("portfolio")}
        </Link>
        <Link
          href="/reconcile"
          className={`nav-link ${pathname === "/reconcile" ? "active" : ""}`}
        >
          {t("reconcile")}
        </Link>
        <Link
          href="/compare"
          className={`nav-link ${pathname === "/compare" ? "active" : ""}`}
        >
          {t("compare")}
        </Link>
        <Link
          href="/settings"
          className={`nav-link ${pathname === "/settings" ? "active" : ""}`}
        >
          {t("settings")}
        </Link>
        <span
          role="separator"
          aria-hidden="true"
          className="nav-divider"
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            margin: "0 4px",
            alignSelf: "center",
          }}
        />
        <button
          onClick={toggleTheme}
          className="nav-link"
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            padding: "6px 10px",
          }}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <Link
          href={pathname}
          locale={otherLocale}
          className="nav-link locale-switch"
          aria-label={`Switch to ${otherLocale === "en" ? "English" : "中文"}`}
        >
          {otherLabel}
        </Link>
        {user && (
          <>
            <span
              className="nav-divider"
              style={{
                width: "1px",
                height: "20px",
                background: "var(--border)",
                margin: "0 4px",
                alignSelf: "center",
              }}
            />
            <span
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
                alignSelf: "center",
              }}
            >
              {user.email}
            </span>
            <button
              onClick={logout}
              className="nav-link"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              {t("logout")}
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
