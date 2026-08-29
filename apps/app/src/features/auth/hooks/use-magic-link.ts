import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { MagicLinkInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";
import { redirectToSsoIfRequired, resolveAuthError, SSO_REDIRECT_IN_PROGRESS } from "../auth-error";

export function useMagicLink() {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  return useMutation({
    mutationKey: ["session", "magic-link-request"],
    mutationFn: async (input: MagicLinkInput) => {
      const { data, error } = await authClient.signIn.magicLink({
        email: input.email,
      });
      if (error) {
        if (await redirectToSsoIfRequired(error)) throw new Error(SSO_REDIRECT_IN_PROGRESS);
        throw new Error(resolveAuthError(error, "magicLink.failed", t, tErrors));
      }

      return data;
    },
    onSuccess: () => toast.success("Magic link sent — check your inbox"),
    onError: (err) => {
      if (err.message === SSO_REDIRECT_IN_PROGRESS) return;
      toast.error(err.message);
    },
  });
}
