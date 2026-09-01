/**
 * Handling for the one refusal the server raises that the user can always act
 * on: their acceptance of a policy went stale while they were already inside
 * the app.
 *
 * `requireCurrentPolicies` (API) answers `POLICY_ACCEPTANCE_REQUIRED` on every
 * gated mutation. Without this handler the refusal only ever reaches the user
 * as copy — the redirect to `/legal/accept` is decided in `_shell`'s
 * `beforeLoad`, which does not run again while the user stays on the page they
 * are already on. So a terms update published mid-session leaves whoever is
 * sitting on `/settings/webhooks` clicking Save against a wall with no way out.
 *
 * The fix reuses the existing mechanism rather than adding a second one:
 * refetch the policy status, then invalidate the router so the *same*
 * `shouldRedirectToLegalAccept` decision runs and issues the redirect. Same
 * shape as `onAuthChange` in `app-providers.tsx` — refetch the queries the
 * route guards read, then hand control back to the router.
 */

import type { QueryClient } from "@tanstack/react-query";
import { policiesQueryOptions } from "../queries/policies";
import type { ApiError } from "./api-error";

const POLICY_ACCEPTANCE_REQUIRED = "POLICY_ACCEPTANCE_REQUIRED";

function isPolicyAcceptanceRequired(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as ApiError).code === POLICY_ACCEPTANCE_REQUIRED;
}

/**
 * `refetchType: "all"` and not the default `"active"`: the policy status is
 * read by `beforeLoad` through `ensureQueryData`, which leaves no mounted
 * observer behind. An `"active"` invalidation would mark the cached entry
 * stale without refetching it, and `ensureQueryData` returns stale data as-is
 * — the guard would then re-read the pre-update answer and let the user
 * through.
 */
export async function handlePolicyRefusal(
  error: unknown,
  queryClient: QueryClient,
  refreshRouter: () => Promise<void> | void,
): Promise<boolean> {
  if (!isPolicyAcceptanceRequired(error)) return false;
  await queryClient.invalidateQueries({
    queryKey: policiesQueryOptions.queryKey,
    refetchType: "all",
  });
  await refreshRouter();
  return true;
}

/**
 * Wired once where the router and the query client meet, so every query and
 * every mutation is covered without a single call site opting in — the same
 * contract as the global telemetry handlers.
 */
export function watchPolicyRefusals(
  queryClient: QueryClient,
  refreshRouter: () => Promise<void> | void,
): () => void {
  const react = (error: unknown): void => {
    void handlePolicyRefusal(error, queryClient, refreshRouter);
  };
  const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") react(event.action.error);
  });
  const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") react(event.action.error);
  });
  return () => {
    unsubscribeQueries();
    unsubscribeMutations();
  };
}
