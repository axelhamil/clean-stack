import { createCaughtErrorReporter } from "@packages/web-kit/observability/caught-error-reporter";
import { captureError } from "./sentry";

export const reportCaughtError = createCaughtErrorReporter(captureError);
