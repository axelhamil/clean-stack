import "@packages/ui/globals.css";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./shared/app-providers";
import { reactErrorHandler } from "./shared/observability/sentry";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(<AppProviders />);
