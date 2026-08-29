import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import type { SignInInput } from "../../../shared/auth/auth.schema";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { redirectToSsoIfRequired, resolveAuthError, SSO_REDIRECT_IN_PROGRESS } from "../auth-error";

const EMAIL_NOT_VERIFIED_REDIRECT = "email-not-verified-redirect";

export function useSignIn(redirectTo?: string) {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationKey: ["session", "sign-in"],
    mutationFn: async (input: SignInInput) => {
      const { data, error } = await authClient.signIn.email({
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      });

      if (error) {
        const code = error.code ?? "";
        if (code === "EMAIL_NOT_VERIFIED" || /verif/i.test(error.message ?? "")) {
          void navigate({ to: "/verify-email" });
          throw new Error(EMAIL_NOT_VERIFIED_REDIRECT);
        }

        if (await redirectToSsoIfRequired(error)) throw new Error(SSO_REDIRECT_IN_PROGRESS);

        throw new Error(resolveAuthError(error, "signIn.failed", t, tErrors));
      }

      return data;
    },
    onSuccess: async () => {
      toast.success(t("signIn.success"));

      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });

      broadcastAuthChange();

      void navigate({ to: redirectTo ?? "/" });
    },
    onError: (err) => {
      if (err.message === EMAIL_NOT_VERIFIED_REDIRECT || err.message === SSO_REDIRECT_IN_PROGRESS)
        return;
      toast.error(err.message);
    },
  });
}
