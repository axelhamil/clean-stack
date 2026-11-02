import type { CaptureError } from "./capture-error";
import { isUnexpectedError } from "./error-classifier";

export function createCaughtErrorReporter(captureError: CaptureError) {
  const reported = new WeakSet<object>();

  return (error: unknown, errorInfo: { componentStack?: string | null }): void => {
    if (!isUnexpectedError(error)) return;

    if (typeof error === "object" && error !== null) {
      if (reported.has(error)) return;
      reported.add(error);
    }

    captureError(error, errorInfo);
  };
}
