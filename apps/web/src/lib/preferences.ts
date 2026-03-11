/**
 * User preferences stored in localStorage.
 * Can be migrated to backend user profile later.
 */

const PREFS_KEY = "dtax_prefs";

export type FiatCurrency =
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CNY"
  | "CAD"
  | "AUD"
  | "CHF"
  | "KRW"
  | "TWD";

export const SUPPORTED_FIATS: { code: FiatCurrency; label: string }[] = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (\u20AC)" },
  { code: "GBP", label: "British Pound (\u00A3)" },
  { code: "JPY", label: "Japanese Yen (\u00A5)" },
  { code: "CNY", label: "Chinese Yuan (\u00A5)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "KRW", label: "Korean Won (\u20A9)" },
  { code: "TWD", label: "Taiwan Dollar (NT$)" },
];

export interface UserPreferences {
  defaultMethod: "FIFO" | "LIFO" | "HIFO" | "SPECIFIC_ID";
  defaultYear: number;
  fiatCurrency: FiatCurrency;
}

const DEFAULTS: UserPreferences = {
  defaultMethod: "FIFO",
  defaultYear: new Date().getFullYear(),
  fiatCurrency: "USD",
};

export function getPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function savePreferences(
  prefs: Partial<UserPreferences>,
): UserPreferences {
  const current = getPreferences();
  const updated = { ...current, ...prefs };
  localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
  return updated;
}
