import * as Sentry from "@sentry/react";
import { env } from "../env";

// Headers that carry the client IP or identity; v10's sendDefaultPii: false stripped them.
const IP_HEADERS = ["forwarded", "-ip", "remote-", "via", "-user"];

if (env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: env.VITE_GIT_SHA,
    // v11 collects user info, cookies, headers, bodies and query data by default.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: IP_HEADERS }, response: { deny: IP_HEADERS } },
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        event.request.data = undefined;
        event.request.query_string = undefined;
      }
      if (event.request?.headers) {
        const h = event.request.headers as Record<string, string | undefined>;
        h.cookie = undefined;
        h.Cookie = undefined;
        h.authorization = undefined;
        h.Authorization = undefined;
        h["x-csrf-token"] = undefined;
      }
      if (event.user) {
        event.user.email = undefined;
        event.user.username = undefined;
        event.user.ip_address = undefined;
      }
      return event;
    },
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) scope.setContext("metadata", context);
    Sentry.captureException(error);
  });
}

export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ message, data });
}

export function setUser(user: { id: string } | null): void {
  Sentry.setUser(user);
}

export const ErrorBoundary = Sentry.ErrorBoundary;
export const reactErrorHandler = Sentry.reactErrorHandler;
