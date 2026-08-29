import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ResetPasswordInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";

export function useResetPassword(token: string) {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const navigate = useNavigate();

  return useMutation({
    mutationKey: ["password", "reset"],
    mutationFn: async (input: ResetPasswordInput) => {
      const { data, error } = await authClient.resetPassword({
        newPassword: input.password,
        token,
      });
      if (error) throw new Error(resolveAuthError(error, "resetPassword.failed", t, tErrors));

      return data;
    },
    onSuccess: () => {
      toast.success(t("resetPassword.successToast"));
      void navigate({ to: "/sign-in" });
    },
    onError: (err) => toast.error(err.message),
  });
}
