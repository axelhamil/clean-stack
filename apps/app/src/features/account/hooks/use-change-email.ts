import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";
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
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.changeEmail", { defaultValue: "Failed to request email change" }),
      ),
  });
}
