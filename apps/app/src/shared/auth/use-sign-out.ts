import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toastError, toastSuccess } from "../api/errors/toast";
import { sessionQueryOptions } from "../api/queries/session";
import { broadcastAuthChange } from "./auth-broadcast";
import { authClient } from "./auth-client";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation("common");

  return useMutation({
    mutationKey: ["session", "sign-out"],
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? t("userMenu.signOutFailed"));
    },
    onSuccess: async () => {
      toastSuccess(t("userMenu.signedOutToast"));
      queryClient.setQueryData(sessionQueryOptions.queryKey, null);

      broadcastAuthChange({ identityChanged: true });

      void navigate({ to: "/sign-in" });
    },
    onError: (err) => toastError(err, t("userMenu.signOutFailed")),
  });
}
