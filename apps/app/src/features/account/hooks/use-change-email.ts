import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
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
      if (error) throw toAuthClientError(error, t("account.emailChangeFailed"));
    },
    onSuccess: () => {
      toast.success(t("account.emailConfirmationSentToast"));
    },
    onError: (err) => toastError(err, errorFallback("changeEmail")),
  });
}
