import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { SignUpInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";
import { redirectToSsoIfRequired, resolveAuthError, SSO_REDIRECT_IN_PROGRESS } from "../auth-error";

export function useSignUp() {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ["session", "sign-up"],
    mutationFn: async ({ acceptedPolicies: _accepted, ...input }: SignUpInput) => {
      const { data, error } = await authClient.signUp.email({
        email: input.email,
        password: input.password,
        name: input.name,
      });
      if (error) {
        if (await redirectToSsoIfRequired(error)) throw new Error(SSO_REDIRECT_IN_PROGRESS);
        throw new Error(resolveAuthError(error, "signUp.failed", t, tErrors));
      }

      return data;
    },
    onSuccess: () => {
      toast.success("Account created — check your email to verify");
      void navigate({ to: "/verify-email" });
    },
    onError: (err) => {
      if (err.message === SSO_REDIRECT_IN_PROGRESS) return;
      toast.error(err.message);
    },
  });
}
