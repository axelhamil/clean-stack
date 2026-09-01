import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";
import type { UpdateProfileInput } from "../account.schema";

export function useUpdateProfile() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["account", "update-profile"],
    mutationFn: async (input: UpdateProfileInput) => {
      const { error } = await authClient.updateUser({ name: input.name });
      if (error) throw new Error(error.message ?? t("account.profileUpdateFailed"));
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange();
      toast.success(t("account.profileUpdatedToast"));
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.updateProfile", { defaultValue: "Failed to update profile" }),
      ),
  });
}
