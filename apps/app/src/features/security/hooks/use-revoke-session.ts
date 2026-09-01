import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { sessionsQueryOptions } from "../../../shared/api/queries/sessions";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";

export function useRevokeSession() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["sessions", "revoke"],
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token });
      if (error) throw new Error(error.message ?? t("sessions.revokeFailed"));
    },
    onSuccess: async () => {
      toast.success(t("sessions.revokedToast"));
      await queryClient.invalidateQueries({
        queryKey: sessionsQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.revokeSession", { defaultValue: "Failed to revoke session" }),
      ),
  });
}
