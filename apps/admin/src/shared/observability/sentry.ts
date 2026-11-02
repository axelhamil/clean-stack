import {
  captureError,
  ErrorBoundary,
  initBrowserSentry,
  reactErrorHandler,
} from "@packages/sentry-scrub/react";
import { env } from "../env";

initBrowserSentry({
  dsn: env.VITE_SENTRY_DSN,
  environment: env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
  release: env.VITE_GIT_SHA,
});

export { captureError, ErrorBoundary, reactErrorHandler };
