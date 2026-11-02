import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authClient } from "../../../shared/auth/auth-client";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";
import type { PasswordPromptInput } from "../security.schema";

export interface EnableTwoFactorResult {
  totpURI: string;
  backupCodes: string[];
}

export function useEnableTwoFactor() {
  const { t } = useTranslation("settings");
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationKey: ["2fa", "enable"],
    mutationFn: async (input: PasswordPromptInput): Promise<EnableTwoFactorResult> => {
      const { data, error } = await authClient.twoFactor.enable({
        password: input.password,
        method: "totp",
      });
      if (error) throw toAuthClientError(error, t("twoFactor.enableFailed"));
      if (data?.method !== "totp" || !data.totpURI || !data.backupCodes) {
        throw new Error(t("twoFactor.unexpectedResponse"));
      }

      return { totpURI: data.totpURI, backupCodes: data.backupCodes };
    },
    onSuccess: async () => {
      await refreshSession();
    },
    onError: (err) => toastError(err, errorFallback("enableTwoFactor")),
  });
}
