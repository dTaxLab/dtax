/**
 * Analytics integration via PostHog.
 * Gracefully degrades when NEXT_PUBLIC_POSTHOG_KEY is not set.
 */
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (typeof window === "undefined" || !POSTHOG_KEY || initialized) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage",
  });
  initialized = true;
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.identify(userId, traits);
}

export function resetAnalytics() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}
