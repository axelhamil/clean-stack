import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import type { PasswordPromptInput } from "../security.schema";

export function useDisableTwoFactor() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["2fa", "disable"],
    mutationFn: async (input: PasswordPromptInput) => {
      const { error } = await authClient.twoFactor.disable({
        password: input.password,
      });
      if (error) throw new Error(error.message ?? t("twoFactor.disableFailed"));
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.disabledToast"));
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) => toast.error(err.message),
  });
}
