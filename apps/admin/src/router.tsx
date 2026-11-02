import { ROUTER_DEFAULTS } from "@packages/web-kit/boot/router-defaults";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./shared/api/query-client";
import { watchAccessRefusals } from "./shared/auth/watch-access-refusals";
import { AppErrorFallback } from "./shared/components/app-error-fallback";
import { NotFoundPage } from "./shared/components/not-found-page";
import { reportCaughtError } from "./shared/observability/report-caught-error";

export const router = createRouter({
  routeTree,
  context: { queryClient },
  ...ROUTER_DEFAULTS,
  defaultErrorComponent: AppErrorFallback,
  defaultNotFoundComponent: NotFoundPage,
  defaultOnCatch: reportCaughtError,
});

watchAccessRefusals(queryClient, () => {
  if (router.state.status === "pending") return;

  void router.invalidate();
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
