import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../adapters/auth-client";
import { passkeysQueryOptions } from "../../../adapters/queries/passkeys";
import type { AddPasskeyInput } from "../_schemas/account.schema";

export function useAddPasskey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddPasskeyInput) => {
      const result = await authClient.passkey.addPasskey({ name: input.name });
      if (result?.error) {
        if (result.error.message?.toLowerCase().includes("not allowed"))
          throw new Error("Cancelled");
        throw new Error(result.error.message ?? "Failed to add passkey");
      }
    },
    onSuccess: async () => {
      toast.success("Passkey added");
      await queryClient.invalidateQueries({
        queryKey: passkeysQueryOptions.queryKey,
      });
    },
    onError: (err) => {
      if (err.message !== "Cancelled") toast.error(err.message);
    },
  });
}
