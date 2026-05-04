import { Toaster } from "@packages/ui/components/ui/sonner";
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
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
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
    </StrictMode>
  );
}
