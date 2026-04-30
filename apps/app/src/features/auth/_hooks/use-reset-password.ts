import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { authClient } from "../../../adapters/auth-client";
import type { ResetPasswordInput } from "../../../adapters/schemas/auth.schema";

export function useResetPassword(token: string) {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (input: ResetPasswordInput) => {
      const { data, error } = await authClient.resetPassword({
        newPassword: input.password,
        token,
      });
      if (error) throw new Error(error.message ?? "Reset failed");

      return data;
    },
    onSuccess: () => {
      toast.success("Password updated — sign in to continue");
      void navigate({ to: "/sign-in" });
    },
    onError: (err) => toast.error(err.message),
  });
}
