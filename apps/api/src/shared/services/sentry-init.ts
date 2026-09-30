import type { ErrorEvent } from "@sentry/bun";
import * as Sentry from "@sentry/bun";
import { env } from "../env";

// Headers that carry the client IP or identity; v10's sendDefaultPii: false stripped them.
const IP_HEADERS = ["forwarded", "-ip", "remote-", "via", "-user"];

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
    // v11 collects user info, cookies, headers, bodies and query data by default.
    // Opt out of every category that can carry PII; beforeSend stays as a second net.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: IP_HEADERS }, response: { deny: IP_HEADERS } },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    beforeSend: scrubEvent,
  });
}
