import type { ErrorEvent } from "@sentry/bun";
import * as Sentry from "@sentry/bun";
import { env } from "../env";

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request.cookies = undefined;
    event.request.data = undefined;
    event.request.query_string = undefined;
    if (event.request.headers) {
      const h = event.request.headers as Record<string, string | undefined>;
      h.cookie = undefined;
      h.Cookie = undefined;
      h.authorization = undefined;
      h.Authorization = undefined;
      h["x-csrf-token"] = undefined;
    }
  }
  if (event.user) {
    event.user.email = undefined;
    event.user.username = undefined;
    event.user.ip_address = undefined;
  }
  return event;
}

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.GIT_SHA,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    integrations: [Sentry.pinoIntegration()],
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
