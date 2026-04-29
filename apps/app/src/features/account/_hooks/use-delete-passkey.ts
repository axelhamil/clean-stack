import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../adapters/auth-client";
import { passkeysQueryOptions } from "../../../adapters/queries/passkeys";

export function useDeletePasskey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) throw new Error(error.message ?? "Failed to delete passkey");
    },
    onSuccess: async () => {
      toast.success("Passkey removed");
      await queryClient.invalidateQueries({
        queryKey: passkeysQueryOptions.queryKey,
      });
    },
    onError: (err) => toast.error(err.message),
  });
}
