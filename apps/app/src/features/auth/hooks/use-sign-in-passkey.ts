import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { redirectToSsoIfRequired, SSO_REDIRECT_IN_PROGRESS } from "../auth-error";

export function useSignInPasskey(redirectTo?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);

  return useMutation({
    mutationKey: ["session", "sign-in-passkey"],
    mutationFn: async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await authClient.signIn.passkey({
        fetchOptions: { signal: controller.signal },
      });
      if (result?.error) {
        const msg = result.error.message?.toLowerCase() ?? "";
        if (msg.includes("not allowed") || msg.includes("cancel")) throw new Error("Cancelled");
        // The passkey leg is server-enforced like the three email-bearing ones, so it
        // gets the same redirect rather than a bare `SSO_REQUIRED` toast.
        if (await redirectToSsoIfRequired(result.error)) throw new Error(SSO_REDIRECT_IN_PROGRESS);
        throw new Error(result.error.message ?? "Passkey sign-in failed");
      }
    },
    onSuccess: async () => {
      toast.success("Welcome back");
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
      void navigate({ to: redirectTo ?? "/" });
    },
    onError: (err) => {
      if (
        err.name === "AbortError" ||
        err.message === "Cancelled" ||
        err.message === SSO_REDIRECT_IN_PROGRESS
      )
        return;
      toast.error(err.message);
    },
  });
}
