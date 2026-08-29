import "@packages/ui/globals.css";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./shared/app-providers";
import { initI18n } from "./shared/i18n/i18n";
import { reactErrorHandler } from "./shared/observability/sentry";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const i18n = await initI18n();

createRoot(rootEl, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(<AppProviders i18n={i18n} />);
