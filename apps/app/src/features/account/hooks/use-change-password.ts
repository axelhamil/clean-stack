import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import type { ChangePasswordInput } from "../account.schema";

export function useChangePassword() {
  return useMutation({
    mutationKey: ["account", "change-password"],
    mutationFn: async (input: ChangePasswordInput) => {
      const { error } = await authClient.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      if (error) throw new Error(error.message ?? "Failed to change password");
    },
    onSuccess: () => {
      toast.success("Password changed");
    },
  });
}
