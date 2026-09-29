import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toAuthClientError } from "../../../shared/api/errors/api-error";
import { toastError } from "../../../shared/api/errors/toast";
import { authClient } from "../../../shared/auth/auth-client";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";
import { errorFallback } from "../../../shared/i18n/get-errors-t";
import type { PasswordPromptInput } from "../security.schema";

export function useDisableTwoFactor() {
  const { t } = useTranslation("settings");
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationKey: ["2fa", "disable"],
    mutationFn: async (input: PasswordPromptInput) => {
      const { error } = await authClient.twoFactor.disable({
        password: input.password,
      });
      if (error) throw toAuthClientError(error, t("twoFactor.disableFailed"));
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.disabledToast"));
      await refreshSession();
    },
    onError: (err) => toastError(err, errorFallback("disableTwoFactor")),
  });
}
