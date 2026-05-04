import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { passkeysQueryOptions } from "../../../shared/api/queries/passkeys";
import { authClient } from "../../../shared/auth/auth-client";

export function useDeletePasskey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["passkeys", "delete"],
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
