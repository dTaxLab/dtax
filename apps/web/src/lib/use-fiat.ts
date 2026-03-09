/**
 * Hook for fiat currency display formatting.
 *
 * Reads the user's fiat preference from localStorage, fetches
 * exchange rates from the API, and provides a formatting function
 * that converts USD values to the selected fiat currency.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { getPreferences } from "./preferences";
import type { FiatCurrency } from "./preferences";
import { getExchangeRates } from "./api";

/** Locale mapping for proper currency formatting. */
const FIAT_LOCALES: Record<FiatCurrency, string> = {
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  CNY: "zh-CN",
  CAD: "en-CA",
  AUD: "en-AU",
  CHF: "de-CH",
  KRW: "ko-KR",
  TWD: "zh-TW",
};

interface FiatState {
  currency: FiatCurrency;
  rate: number;
  loading: boolean;
}

/**
 * Hook that provides fiat-aware currency formatting.
 *
 * @returns `formatFiat(usdValue)` — converts and formats a USD amount
 *          into the user's selected fiat currency.
 */
export function useFiatFormatter() {
  const [state, setState] = useState<FiatState>({
    currency: "USD",
    rate: 1,
    loading: true,
  });

  useEffect(() => {
    const prefs = getPreferences();
    const currency = prefs.fiatCurrency || "USD";

    if (currency === "USD") {
      setState({ currency, rate: 1, loading: false });
      return;
    }

    // Fetch exchange rates for non-USD currencies
    getExchangeRates()
      .then((res) => {
        const rate = res.data.rates[currency] ?? 1;
        setState({ currency, rate, loading: false });
      })
      .catch(() => {
        // Fallback to USD on error
        setState({ currency, rate: 1, loading: false });
      });
  }, []);

  const formatFiat = useCallback(
    (usdValue: number | undefined | null): string => {
      if (usdValue === undefined || usdValue === null) return "—";
      const converted = usdValue * state.rate;
      const locale = FIAT_LOCALES[state.currency] || "en-US";

      // JPY and KRW have no decimal places
      const noDecimals = ["JPY", "KRW", "TWD"].includes(state.currency);

      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: state.currency,
        minimumFractionDigits: noDecimals ? 0 : 2,
        maximumFractionDigits: noDecimals ? 0 : 2,
      }).format(converted);
    },
    [state.currency, state.rate],
  );

  return {
    formatFiat,
    currency: state.currency,
    rate: state.rate,
    loading: state.loading,
  };
}
