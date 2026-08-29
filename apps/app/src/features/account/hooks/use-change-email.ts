import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import type { ChangeEmailInput } from "../account.schema";

export function useChangeEmail() {
  const { t } = useTranslation("settings");
  return useMutation({
    mutationKey: ["account", "change-email"],
    mutationFn: async (input: ChangeEmailInput) => {
      const { error } = await authClient.changeEmail({
        newEmail: input.newEmail,
        callbackURL: `${window.location.origin}/settings/account`,
      });
      if (error) throw new Error(error.message ?? t("account.emailChangeFailed"));
    },
    onSuccess: () => {
      toast.success(t("account.emailConfirmationSentToast"));
    },
    onError: (err) => toast.error(err.message),
  });
}
