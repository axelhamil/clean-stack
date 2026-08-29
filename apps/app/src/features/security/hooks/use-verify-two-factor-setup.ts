import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import type { VerifyTotpSetupInput } from "../security.schema";

export function useVerifyTwoFactorSetup() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["2fa", "verify-setup"],
    mutationFn: async (input: VerifyTotpSetupInput) => {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: input.code,
      });
      if (error) throw new Error(error.message ?? t("twoFactor.verifyFailed"));
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.enabledToast"));
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) => toast.error(err.message),
  });
}
