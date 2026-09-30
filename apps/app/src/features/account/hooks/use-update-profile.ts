import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toAuthClientError } from "../../../shared/api/errors/api-error";
import { toastError } from "../../../shared/api/errors/toast";
import { authClient } from "../../../shared/auth/auth-client";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";
import { errorFallback } from "../../../shared/i18n/get-errors-t";
import type { UpdateProfileInput } from "../account.schema";

export function useUpdateProfile() {
  const { t } = useTranslation("settings");
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationKey: ["account", "update-profile"],
    mutationFn: async (input: UpdateProfileInput) => {
      const { error } = await authClient.updateUser({ name: input.name });
      if (error) throw toAuthClientError(error, t("account.profileUpdateFailed"));
    },
    onSuccess: async () => {
      await refreshSession();
      toast.success(t("account.profileUpdatedToast"));
    },
    onError: (err) => toastError(err, errorFallback("updateProfile")),
  });
}
