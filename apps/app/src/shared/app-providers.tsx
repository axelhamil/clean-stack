import { Toaster } from "@packages/ui/components/ui/sonner";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { ZodLocale } from "@packages/web-kit/i18n/zod-locale";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { i18n as I18nInstance } from "i18next";
import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import { router } from "../router";
import { activeOrgQueryOptions } from "./api/queries/active-org";
import { CURRENT_MEMBERSHIP_QUERY_PREFIX } from "./api/queries/current-membership";
import { orgsListQueryOptions } from "./api/queries/orgs-list";
import { sessionQueryOptions } from "./api/queries/session";
import { queryClient } from "./api/query-client";
import { onAuthChange } from "./auth/auth-broadcast";
import { AnalyticsScripts } from "./components/analytics-scripts";
import { AppErrorFallback } from "./components/app-error-fallback";
import { CookieBanner } from "./components/cookie-banner";
import { LocaleSync } from "./i18n/locale-sync";
import { ErrorBoundary } from "./observability/sentry";
import { watchSession } from "./observability/session-watcher";

const TOOLTIP_OPEN_DELAY_MS = 300;

watchSession(queryClient);

onAuthChange(async () => {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey }),
    queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
    queryClient.refetchQueries({ queryKey: CURRENT_MEMBERSHIP_QUERY_PREFIX }),
    queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
  ]);
  await router.invalidate();
});

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
              <CookieBanner />
            </TooltipProvider>
            <ThemedToaster />
            <LocaleSync />
            <ZodLocale />
            <AnalyticsScripts />
            {import.meta.env.DEV && (
              <>
                <TanStackRouterDevtools router={router} position="bottom-left" />
                <ReactQueryDevtools buttonPosition="bottom-right" />
              </>
            )}
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
