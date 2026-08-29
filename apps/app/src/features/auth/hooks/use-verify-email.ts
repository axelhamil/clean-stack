import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";

export function useVerifyEmail() {
  const { t } = useTranslation("auth");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ["email", "verify"],
    mutationFn: async (token: string) => {
      const { data, error } = await authClient.verifyEmail({
        query: { token },
      });
      if (error) throw new Error(error.message ?? t("verifyEmail.failedFallback"));

      return data;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });

      broadcastAuthChange();

      void navigate({ to: "/" });
    },
  });
}
