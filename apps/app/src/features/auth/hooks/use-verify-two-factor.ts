import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { TwoFactorInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";
import { useCompleteSignIn } from "./use-complete-sign-in";

export function useVerifyTwoFactor(redirectTo?: string) {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const completeSignIn = useCompleteSignIn();

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
      await completeSignIn(redirectTo);
    },
    onError: (err) => toast.error(err.message),
  });
}
