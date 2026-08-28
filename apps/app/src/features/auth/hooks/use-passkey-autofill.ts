import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { redirectToSsoIfRequired } from "../auth-error";

interface UsePasskeyAutofillOptions {
  enabled: boolean;
  redirectTo?: string;
}

interface PasskeyAutofillHandle {
  abort: () => void;
}

export function usePasskeyAutofill({
  enabled,
  redirectTo,
}: UsePasskeyAutofillOptions): PasskeyAutofillHandle {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const result = await authClient.signIn.passkey({
          autoFill: true,
          fetchOptions: { signal: controller.signal },
        });
        if (controller.signal.aborted) return;
        if (result?.error) {
          // Conditional UI stays silent on every expected failure, but an SSO-enforced
          // domain is not a failure to hide: send the user to their IdP instead of
          // leaving the autofill prompt dead with no feedback.
          await redirectToSsoIfRequired(result.error);
          return;
        }
        toast.success("Welcome back");
        await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
        broadcastAuthChange();
        void navigate({ to: redirectTo ?? "/" });
      } catch {
        // passive conditional passkey UI — cancel / abort / no-credential are expected, never surfaced
      }
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [enabled, redirectTo, queryClient, navigate]);

  return {
    abort: () => abortRef.current?.abort(),
  };
}
