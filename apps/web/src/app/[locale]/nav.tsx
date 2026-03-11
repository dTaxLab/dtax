"use client";

import { useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "/", label: t("dashboard") },
    { href: "/transactions", label: t("transactions") },
    { href: "/transfers", label: t("transfers") },
    { href: "/tax", label: t("taxReport") },
    { href: "/portfolio", label: t("portfolio") },
    { href: "/reconcile", label: t("reconcile") },
    { href: "/compare", label: t("compare") },
    { href: "/settings", label: t("settings") },
  ] as const;

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

      {/* Hamburger button — mobile only */}
      <button
        className="nav-hamburger"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span className={`hamburger-line ${menuOpen ? "open" : ""}`} />
        <span className={`hamburger-line ${menuOpen ? "open" : ""}`} />
        <span className={`hamburger-line ${menuOpen ? "open" : ""}`} />
      </button>

      <div className={`nav-links ${menuOpen ? "nav-links-open" : ""}`}>
        {user ? (
          <>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${pathname === link.href ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </>
        ) : (
          <>
            <Link
              href="/legal/terms"
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              {t("legal")}
            </Link>
            <Link
              href="/auth"
              className="nav-link"
              style={{ fontWeight: 600, color: "var(--accent)" }}
              onClick={() => setMenuOpen(false)}
            >
              {t("signIn")}
            </Link>
          </>
        )}
        <span role="separator" aria-hidden="true" className="nav-divider" />
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
            <span className="nav-divider" />
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
              onClick={() => {
                logout();
                setMenuOpen(false);
              }}
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
