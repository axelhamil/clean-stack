import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";

export function useVerifyMagicLink() {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ["session", "magic-link-verify"],
    mutationFn: async (token: string) => {
      const { data, error } = await authClient.magicLink.verify({
        query: { token },
      });
      if (error) throw new Error(resolveAuthError(error, "magicLink.invalidOrExpired", t, tErrors));

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
