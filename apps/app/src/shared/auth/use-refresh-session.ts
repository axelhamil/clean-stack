import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { sessionQueryOptions } from "../api/queries/session";
import { broadcastAuthChange } from "./auth-broadcast";

export async function refetchSession(queryClient: QueryClient): Promise<void> {
  const { queryKey } = sessionQueryOptions;

  await queryClient.refetchQueries({ queryKey });

  const state = queryClient.getQueryState(queryKey);
  if (state?.status === "error" && state.data === null) queryClient.removeQueries({ queryKey });
}

/**
 * For a mutation that changes the signed-in person's own session (sign-in,
 * 2FA, profile, deletion schedule): refetch the session in this tab first, so
 * its gates read the new state before anything navigates, then tell the other
 * tabs to do the same.
 */
export function useRefreshSession(): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await refetchSession(queryClient);
    broadcastAuthChange();
  }, [queryClient]);
}
