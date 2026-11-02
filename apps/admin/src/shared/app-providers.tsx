import { Toaster } from "@packages/ui/components/ui/sonner";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { ZodLocale } from "@packages/web-kit/i18n/zod-locale";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { i18n as I18nInstance } from "i18next";
import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import { router } from "../router";
import { queryClient } from "./api/query-client";
import { AppErrorFallback } from "./components/app-error-fallback";
import { ErrorBoundary } from "./observability/sentry";

const TOOLTIP_OPEN_DELAY_MS = 300;

interface AppProvidersProps {
  i18n: I18nInstance;
}

export function AppProviders({ i18n }: AppProvidersProps) {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ErrorBoundary fallback={<AppErrorFallback />}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={TOOLTIP_OPEN_DELAY_MS}>
              <RouterProvider router={router} />
            </TooltipProvider>
            <ThemedToaster />
            <ZodLocale />
          </QueryClientProvider>
        </ErrorBoundary>
      </I18nextProvider>
    </StrictMode>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return <Toaster theme={resolvedTheme} richColors closeButton />;
}
