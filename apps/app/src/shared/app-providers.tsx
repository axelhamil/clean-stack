import { Button } from "@packages/ui/components/ui/button";
import { Toaster } from "@packages/ui/components/ui/sonner";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { i18n as I18nInstance } from "i18next";
import { ThemeProvider } from "next-themes";
import { StrictMode, useEffect } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { router } from "../router";
import { activeOrgQueryOptions } from "./api/queries/active-org";
import { CURRENT_MEMBERSHIP_QUERY_PREFIX } from "./api/queries/current-membership";
import { orgsListQueryOptions } from "./api/queries/orgs-list";
import { sessionQueryOptions } from "./api/queries/session";
import { queryClient } from "./api/query-client";
import { onAuthChange } from "./auth/auth-broadcast";
import { AnalyticsScripts } from "./components/analytics-scripts";
import { CookieBanner } from "./components/cookie-banner";
import { LocaleSync } from "./i18n/locale-sync";
import { applyZodErrorMap } from "./i18n/zod-error-map";
import { ErrorBoundary } from "./observability/sentry";
import { watchSession } from "./observability/session-watcher";

watchSession(queryClient);

const cspNonce = (() => {
  if (typeof document === "undefined") return undefined;
  // <meta> is not a nonceable element, so the IDL .nonce property stays empty — read the attribute.
  return (
    document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.getAttribute("nonce") ??
    undefined
  );
})();

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
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            nonce={cspNonce}
          >
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
              <Toaster richColors closeButton />
              <CookieBanner />
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
          </ThemeProvider>
        </ErrorBoundary>
      </I18nextProvider>
    </StrictMode>
  );
}

function ZodLocale() {
  const { t } = useTranslation("errors");
  useEffect(() => {
    applyZodErrorMap(t);
  }, [t]);
  return null;
}

function AppErrorFallback() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <TypographyH1>{t("errorBoundary.title")}</TypographyH1>
      <TypographyMuted>{t("errorBoundary.body")}</TypographyMuted>
      <Button variant="outline" onClick={() => window.location.reload()}>
        {t("actions.reload")}
      </Button>
    </main>
  );
}
