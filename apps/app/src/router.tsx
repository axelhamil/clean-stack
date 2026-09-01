import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { watchPolicyRefusals } from "./shared/api/errors/policy-refusal";
import { queryClient } from "./shared/api/query-client";

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 100,
  defaultPendingMinMs: 300,
  scrollRestoration: true,
});

watchPolicyRefusals(queryClient, () => router.invalidate());

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
