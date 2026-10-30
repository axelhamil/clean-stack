import { isUnexpectedError } from "@packages/web-kit/observability/error-classifier";
import { captureError } from "./sentry";

const reported = new WeakSet<object>();

export function reportCaughtError(
  error: unknown,
  errorInfo: { componentStack?: string | null },
): void {
  if (!isUnexpectedError(error)) return;

  if (typeof error === "object" && error !== null) {
    if (reported.has(error)) return;
    reported.add(error);
  }

  captureError(error, errorInfo);
}
