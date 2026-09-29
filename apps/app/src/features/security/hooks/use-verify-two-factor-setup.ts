import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toAuthClientError } from "../../../shared/api/errors/api-error";
import { toastError } from "../../../shared/api/errors/toast";
import { authClient } from "../../../shared/auth/auth-client";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";
import { errorFallback } from "../../../shared/i18n/get-errors-t";
import type { VerifyTotpSetupInput } from "../security.schema";

export function useVerifyTwoFactorSetup() {
  const { t } = useTranslation("settings");
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationKey: ["2fa", "verify-setup"],
    mutationFn: async (input: VerifyTotpSetupInput) => {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: input.code,
      });
      if (error) throw toAuthClientError(error, t("twoFactor.verifyFailed"));
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.enabledToast"));
      await refreshSession();
    },
    onError: (err) => toastError(err, errorFallback("verifyTwoFactorSetup")),
  });
}
