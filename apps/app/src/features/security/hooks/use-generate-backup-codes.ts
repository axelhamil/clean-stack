import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toastError } from "../../../shared/api/errors/toast";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";
import type { PasswordPromptInput } from "../security.schema";

export function useGenerateBackupCodes() {
  const { t } = useTranslation("settings");

  return useMutation({
    mutationKey: ["2fa", "generate-backup-codes"],
    mutationFn: async (input: PasswordPromptInput): Promise<string[]> => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password: input.password,
      });
      if (error) throw new Error(error.message ?? t("recoveryCodes.regenerateFailed"));
      if (!data?.backupCodes) throw new Error(t("twoFactor.unexpectedResponse"));
      return data.backupCodes;
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.regenerateBackupCodes", {
          defaultValue: "Couldn't regenerate your recovery codes. Please try again.",
        }),
      ),
  });
}
