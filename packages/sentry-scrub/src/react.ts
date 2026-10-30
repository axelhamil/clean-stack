import * as Sentry from "@sentry/react";
import { IP_HEADERS, scrubBreadcrumb, scrubEvent } from "./scrub-event";

export interface BrowserSentryConfig {
  dsn?: string;
  environment: string;
  release?: string;
}

export function initBrowserSentry({ dsn, environment, release }: BrowserSentryConfig): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment,
    release,
    // v11 collects user info, cookies, headers, bodies and query data by default.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: IP_HEADERS }, response: { deny: IP_HEADERS } },
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) scope.setContext("metadata", context);
    Sentry.captureException(error);
  });
}

export const ErrorBoundary = Sentry.ErrorBoundary;
export const reactErrorHandler = Sentry.reactErrorHandler;
