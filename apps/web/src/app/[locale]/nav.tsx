"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";

const PRIMARY_LINKS = [
  { href: "/", key: "dashboard" },
  { href: "/transactions", key: "transactions" },
  { href: "/tax", key: "taxReport" },
  { href: "/portfolio", key: "portfolio" },
  { href: "/settings", key: "settings" },
] as const;

const MORE_LINKS = [
  { href: "/transfers", key: "transfers" },
  { href: "/reconcile", key: "reconcile" },
  { href: "/compare", key: "compare" },
  { href: "/ai-assistant", key: "aiAssistant" },
  { href: "/simulator", key: "simulator" },
] as const;

export function LocaleNav({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const currentLocale = useLocale();
  const otherLocale = currentLocale === "en" ? "zh" : "en";
  const otherLabel = currentLocale === "en" ? "中文" : "EN";
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isOnboarding = pathname === "/onboarding";
  const isInMore = MORE_LINKS.some((l) => pathname === l.href);

  // Close "More" dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
      {!isOnboarding && (
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
      )}

      <div className={`nav-links ${menuOpen ? "nav-links-open" : ""}`}>
        {user && !isOnboarding ? (
          <>
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${pathname === link.href ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                {t(link.key)}
              </Link>
            ))}

            {/* "More" dropdown */}
            <div className="nav-more" ref={moreRef}>
              <button
                className={`nav-link nav-more-trigger ${isInMore ? "active" : ""}`}
                onClick={() => setMoreOpen(!moreOpen)}
                aria-expanded={moreOpen}
                aria-haspopup="true"
              >
                {t("more")}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  aria-hidden="true"
                  className={`nav-more-chevron ${moreOpen ? "nav-more-chevron-open" : ""}`}
                >
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
              {moreOpen && (
                <div className="nav-dropdown">
                  {MORE_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`nav-dropdown-item ${pathname === link.href ? "active" : ""}`}
                      onClick={() => {
                        setMoreOpen(false);
                        setMenuOpen(false);
                      }}
                    >
                      {t(link.key)}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className={`nav-link ${pathname === "/admin" ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                {t("admin")}
              </Link>
            )}
          </>
        ) : !user ? (
          <>
            <Link
              href="/features"
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              {t("features")}
            </Link>
            <Link
              href="/pricing"
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              {t("pricing")}
            </Link>
            <Link
              href="/exchanges"
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              {t("exchanges")}
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
        ) : null}

        <span role="separator" aria-hidden="true" className="nav-divider" />
        <button
          onClick={toggleTheme}
          className="nav-link nav-icon-btn"
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
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
            <span className="nav-user-email">{user.email}</span>
            <button
              onClick={() => {
                logout();
                setMenuOpen(false);
              }}
              className="nav-link nav-icon-btn"
              aria-label={t("logout")}
              title={t("logout")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 14H3.33C2.6 14 2 13.4 2 12.67V3.33C2 2.6 2.6 2 3.33 2H6" />
                <path d="M10.67 11.33L14 8L10.67 4.67" />
                <path d="M14 8H6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
