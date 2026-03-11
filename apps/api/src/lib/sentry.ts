/**
 * Sentry 错误监控初始化
 * 仅在 SENTRY_DSN 环境变量存在时启用。
 */

import * as Sentry from "@sentry/node";

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(error, { extra: context });
}
