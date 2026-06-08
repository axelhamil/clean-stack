import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../shared/auth/auth-client";
import type { ChangeEmailInput } from "../account.schema";

export function useChangeEmail() {
  return useMutation({
    mutationKey: ["account", "change-email"],
    mutationFn: async (input: ChangeEmailInput) => {
      const { error } = await authClient.changeEmail({
        newEmail: input.newEmail,
        callbackURL: `${window.location.origin}/settings/account`,
      });
      if (error) throw new Error(error.message ?? "Failed to request email change");
    },
    onSuccess: () => {
      toast.success("Confirmation email sent to your current address.");
    },
    onError: (err) => toast.error(err.message),
  });
}
