import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";

export function useSignInPasskey(redirectTo?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);

  return useMutation({
    mutationFn: async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await authClient.signIn.passkey({
        fetchOptions: { signal: controller.signal },
      });
      if (result?.error) {
        if (result.error.message?.toLowerCase().includes("not allowed"))
          throw new Error("Cancelled");
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
      if (err.name === "AbortError" || err.message === "Cancelled") return;
      toast.error(err.message);
    },
  });
}
