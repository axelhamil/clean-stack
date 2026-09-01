import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import type { ChangePasswordInput } from "../account.schema";

export function useChangePassword() {
  const { t } = useTranslation("settings");
  return useMutation({
    mutationKey: ["account", "change-password"],
    mutationFn: async (input: ChangePasswordInput) => {
      const { error } = await authClient.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      if (error) throw new Error(error.message ?? t("account.passwordChangeFailed"));
    },
    onSuccess: () => {
      toast.success(t("account.passwordChangedToast"));
    },
  });
}
