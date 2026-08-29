import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import type { EmailRequestInput } from "../auth.schema";

export function useSignInSso() {
  const { t } = useTranslation("auth");
  return useMutation({
    mutationKey: ["session", "sign-in-sso"],
    mutationFn: async (input: EmailRequestInput) => {
      // On success the server responds { url, redirect: true } and better-auth's
      // built-in redirect fetch-plugin sends the browser to the IdP directly —
      // there is no local navigation to perform here.
      const { error } = await authClient.signIn.sso({
        email: input.email,
        callbackURL: `${window.location.origin}/dashboard`,
      });
      if (error) throw new Error(error.message ?? t("signIn.ssoFailed"));
    },
    onError: (err) => toast.error(err.message),
  });
}
