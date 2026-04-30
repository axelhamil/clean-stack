import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";

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
      const result = await authClient.signIn.passkey({
        autoFill: true,
        fetchOptions: { signal: controller.signal },
      });
      if (controller.signal.aborted) return;
      if (result?.error) {
        const message = result.error.message?.toLowerCase() ?? "";
        if (message.includes("not allowed")) return;
        toast.error(result.error.message ?? "Passkey sign-in failed");
        return;
      }
      toast.success("Welcome back");
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      void navigate({ to: redirectTo ?? "/" });
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
