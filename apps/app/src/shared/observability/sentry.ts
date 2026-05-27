import * as Sentry from "@sentry/react";
import { env } from "../env";

if (env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: env.VITE_GIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.headers) {
        const h = event.request.headers as Record<string, string | undefined>;
        h.cookie = undefined;
        h.Cookie = undefined;
        h.authorization = undefined;
        h.Authorization = undefined;
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

export const ErrorBoundary = Sentry.ErrorBoundary;
export const reactErrorHandler = Sentry.reactErrorHandler;
