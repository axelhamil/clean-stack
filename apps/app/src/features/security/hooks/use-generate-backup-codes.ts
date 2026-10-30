import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authClient } from "../../../shared/auth/auth-client";
import type { PasswordPromptInput } from "../security.schema";

export function useGenerateBackupCodes() {
  const { t } = useTranslation("settings");

  return useMutation({
    mutationKey: ["2fa", "generate-backup-codes"],
    mutationFn: async (input: PasswordPromptInput): Promise<string[]> => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password: input.password,
      });
      if (error) throw toAuthClientError(error, t("recoveryCodes.regenerateFailed"));
      if (!data?.backupCodes) throw new Error(t("twoFactor.unexpectedResponse"));
      return data.backupCodes;
    },
    onError: (err) => toastError(err, errorFallback("regenerateBackupCodes")),
  });
}
