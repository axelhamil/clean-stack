import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MagicLinkInput } from "../../../shared/auth/auth.schema";
import { authClient } from "../../../shared/auth/auth-client";

export function useMagicLink() {
  return useMutation({
    mutationKey: ["session", "magic-link-request"],
    mutationFn: async (input: MagicLinkInput) => {
      const { data, error } = await authClient.signIn.magicLink({
        email: input.email,
      });
      if (error) throw new Error(error.message ?? "Failed to send link");

      return data;
    },
    onSuccess: () => toast.success("Magic link sent — check your inbox"),
    onError: (err) => toast.error(err.message),
  });
}
