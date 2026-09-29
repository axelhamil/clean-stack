import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";

/**
 * Every flow that ends with a signed-in browser (password, passkey, magic link,
 * 2FA, email verification) closes the same way: push the new session into the
 * query, tell the other tabs, then leave the auth screen. Memoised because the
 * passkey autofill effect lists it as a dependency.
 */
export function useCompleteSignIn(): (redirectTo?: string) => Promise<void> {
  const refreshSession = useRefreshSession();
  const navigate = useNavigate();

  return useCallback(
    async (redirectTo?: string) => {
      await refreshSession();
      void navigate({ to: redirectTo ?? "/" });
    },
    [refreshSession, navigate],
  );
}
