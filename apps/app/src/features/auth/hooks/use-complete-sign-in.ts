import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";

/**
 * Every flow that ends with a signed-in browser (password, passkey, magic link,
 * 2FA, email verification) closes the same way: push the new session into the
 * query, tell the other tabs, then leave the auth screen. Memoised because the
 * passkey autofill effect lists it as a dependency.
 */
export function useCompleteSignIn(): (redirectTo?: string) => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useCallback(
    async (redirectTo?: string) => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      void navigate({ to: redirectTo ?? "/" });
    },
    [queryClient, navigate],
  );
}
