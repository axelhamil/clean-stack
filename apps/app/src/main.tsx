import "@packages/ui/globals.css";
import { initI18n } from "@packages/web-kit/i18n/i18n";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./shared/app-providers";
import { reportCaughtError } from "./shared/observability/report-caught-error";
import { captureError, reactErrorHandler } from "./shared/observability/sentry";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const i18n = await initI18n(captureError);

createRoot(rootEl, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reportCaughtError,
  onRecoverableError: reactErrorHandler(),
}).render(<AppProviders i18n={i18n} />);
