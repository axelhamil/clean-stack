import "@packages/ui/globals.css";
import { mountApp } from "@packages/web-kit/boot/mount-app";
import { AppProviders } from "./shared/app-providers";
import { reportCaughtError } from "./shared/observability/report-caught-error";
import { captureError, reactErrorHandler } from "./shared/observability/sentry";

await mountApp({
  captureError,
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reportCaughtError,
  onRecoverableError: reactErrorHandler(),
  render: (i18n) => <AppProviders i18n={i18n} />,
});
