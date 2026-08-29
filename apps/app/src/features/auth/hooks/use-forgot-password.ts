import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ForgotPasswordInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";
import { resolveAuthError } from "../auth-error";

export function useForgotPassword() {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  return useMutation({
    mutationKey: ["password", "forgot"],
    mutationFn: async (input: ForgotPasswordInput) => {
      const { data, error } = await authClient.requestPasswordReset({
        email: input.email,
      });
      if (error) throw new Error(resolveAuthError(error, "forgotPassword.failed", t, tErrors));

      return data;
    },
    onSuccess: () => toast.success("Check your inbox for the reset link"),
    onError: (err) => toast.error(err.message),
  });
}
