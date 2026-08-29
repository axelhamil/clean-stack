import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
      if (error) throw new Error(error.message ?? t("recoveryCodes.regenerateFailed"));
      if (!data?.backupCodes) throw new Error(t("twoFactor.unexpectedResponse"));
      return data.backupCodes;
    },
    onError: (err) => toast.error(err.message),
  });
}
