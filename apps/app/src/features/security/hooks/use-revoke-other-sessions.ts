import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { sessionsQueryOptions } from "../../../shared/api/queries/sessions";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";

export function useRevokeOtherSessions() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["sessions", "revoke-others"],
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message ?? t("sessions.revokeOthersFailed"));
    },
    onSuccess: async () => {
      toast.success(t("sessions.othersRevokedToast"));
      await queryClient.invalidateQueries({
        queryKey: sessionsQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) =>
      toastError(
        err,
        getErrorsT()("fallback.revokeOtherSessions", { defaultValue: "Failed to revoke sessions" }),
      ),
  });
}
