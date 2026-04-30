import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../adapters/auth-client";
import type { MagicLinkInput } from "../../../adapters/schemas/auth.schema";

export function useMagicLink() {
  return useMutation({
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
