import { ErrorFallback } from "@packages/ui/components/ui/error-fallback";
import { useErrorFallbackLabels } from "@packages/web-kit/i18n/use-error-fallback-labels";

export function AppErrorFallback() {
  return <ErrorFallback {...useErrorFallbackLabels()} />;
}
