import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ForgotPasswordInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";

export function useForgotPassword() {
  return useMutation({
    mutationKey: ["password", "forgot"],
    mutationFn: async (input: ForgotPasswordInput) => {
      const { data, error } = await authClient.requestPasswordReset({
        email: input.email,
      });
      if (error) throw new Error(error.message ?? "Request failed");

      return data;
    },
    onSuccess: () => toast.success("Check your inbox for the reset link"),
    onError: (err) => toast.error(err.message),
  });
}
