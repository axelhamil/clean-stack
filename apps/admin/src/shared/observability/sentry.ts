import { IP_HEADERS, scrubBreadcrumb, scrubEvent } from "@packages/sentry-scrub";
import * as Sentry from "@sentry/react";
import { env } from "../env";

if (env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: env.VITE_GIT_SHA,
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
