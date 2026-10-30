import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { env } from "../env";
import { authClient } from "./auth-client";
import { signInUrl } from "./sign-in-url";

export function useSignOut() {
  const { t } = useTranslation("common");

  return useMutation({
    mutationKey: ["session", "sign-out"],
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? t("userMenu.signOutFailed"));
    },
    onSuccess: () =>
      window.location.assign(signInUrl(env.VITE_APP_URL, `${window.location.origin}/`)),
    onError: (err) => toastError(err, t("userMenu.signOutFailed")),
  });
}
