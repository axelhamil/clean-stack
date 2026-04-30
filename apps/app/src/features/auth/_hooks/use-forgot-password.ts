import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../adapters/auth-client";
import type { ForgotPasswordInput } from "../../../adapters/schemas/auth.schema";

export function useForgotPassword() {
  return useMutation({
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
