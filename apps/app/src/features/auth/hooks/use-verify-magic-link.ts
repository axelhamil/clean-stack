import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";
import { useCompleteSignIn } from "./use-complete-sign-in";

export function useVerifyMagicLink() {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const completeSignIn = useCompleteSignIn();

  return useMutation({
    mutationKey: ["session", "magic-link-verify"],
    mutationFn: async (token: string) => {
      const { data, error } = await authClient.magicLink.verify({
        query: { token },
      });
      if (error) throw new Error(resolveAuthError(error, "magicLink.invalidOrExpired", t, tErrors));

      return data;
    },
    onSuccess: () => completeSignIn(),
  });
}
