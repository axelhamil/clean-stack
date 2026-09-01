import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import type { TwoFactorInput } from "../../../shared/auth/auth.schema";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";

export function useVerifyTwoFactor(redirectTo?: string) {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ["session", "verify-two-factor"],
    mutationFn: async (input: TwoFactorInput) => {
      const { data, error } = await authClient.twoFactor.verifyTotp({
        code: input.code,
        trustDevice: input.trustDevice,
      });
      if (error) throw new Error(resolveAuthError(error, "twoFactor.invalidCode", t, tErrors));

      return data;
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.verifiedToast"));
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });

      broadcastAuthChange();

      void navigate({ to: redirectTo ?? "/" });
    },
    onError: (err) => toast.error(err.message),
  });
}
