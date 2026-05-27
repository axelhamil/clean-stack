import { Button } from "@packages/ui/components/ui/button";
import { Toaster } from "@packages/ui/components/ui/sonner";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { router } from "../router";
import { activeOrgQueryOptions } from "./api/queries/active-org";
import { currentMembershipQueryOptions } from "./api/queries/current-membership";
import { orgsListQueryOptions } from "./api/queries/orgs-list";
import { sessionQueryOptions } from "./api/queries/session";
import { queryClient } from "./api/query-client";
import { onAuthChange } from "./auth/auth-broadcast";
import { ErrorBoundary } from "./observability/sentry";

onAuthChange(async () => {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey }),
    queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
    queryClient.refetchQueries({ queryKey: currentMembershipQueryOptions.queryKey }),
    queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
  ]);
  await router.invalidate();
});

export function AppProviders() {
  return (
    <StrictMode>
      <ErrorBoundary fallback={<AppErrorFallback />}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            <Toaster richColors closeButton />
            {import.meta.env.DEV && (
              <>
                <TanStackRouterDevtools router={router} position="bottom-left" />
                <ReactQueryDevtools buttonPosition="bottom-right" />
              </>
            )}
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

function AppErrorFallback() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <TypographyH1>Something went wrong</TypographyH1>
      <TypographyMuted>
        We've been notified and are looking into it. Try reloading the page.
      </TypographyMuted>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </main>
  );
}
