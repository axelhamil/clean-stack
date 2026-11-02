import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BackupCodeVerifyInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";
import { useCompleteSignIn } from "./use-complete-sign-in";

export function useVerifyBackupCode(redirectTo?: string) {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const completeSignIn = useCompleteSignIn();

  return useMutation({
    mutationKey: ["session", "verify-backup-code"],
    mutationFn: async (input: BackupCodeVerifyInput) => {
      const { data, error } = await authClient.twoFactor.verifyBackupCode({
        code: input.code,
        trustDevice: input.trustDevice,
      });
      if (error)
        throw new Error(resolveAuthError(error, "twoFactor.invalidBackupCode", t, tErrors));

      return data;
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.verifiedToast"));
      toast.info(t("twoFactor.backupCodeUsedNotice"));
      await completeSignIn(redirectTo);
    },
    onError: (err) => toast.error(err.message),
  });
}
