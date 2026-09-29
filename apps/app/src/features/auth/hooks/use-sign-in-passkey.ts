import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import { redirectToSsoIfRequired, resolveAuthError, SSO_REDIRECT_IN_PROGRESS } from "../auth-error";
import { useCompleteSignIn } from "./use-complete-sign-in";

export function useSignInPasskey(redirectTo?: string) {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const completeSignIn = useCompleteSignIn();
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
      if (!result?.error) return;

      const message = result.error.message?.toLowerCase() ?? "";
      if (message.includes("not allowed") || message.includes("cancel")) {
        throw new Error("Cancelled");
      }

      // The passkey leg is server-enforced like the three email-bearing ones, so it
      // gets the same redirect rather than a bare `SSO_REQUIRED` toast.
      if (await redirectToSsoIfRequired(result.error)) throw new Error(SSO_REDIRECT_IN_PROGRESS);

      throw new Error(resolveAuthError(result.error, "passkey.failed", t, tErrors));
    },
    onSuccess: async () => {
      toast.success(t("signIn.success"));
      await completeSignIn(redirectTo);
    },
    onError: (err) => {
      if (err.name === "AbortError") return;
      if (err.message === "Cancelled" || err.message === SSO_REDIRECT_IN_PROGRESS) return;

      toast.error(err.message);
    },
  });
}
