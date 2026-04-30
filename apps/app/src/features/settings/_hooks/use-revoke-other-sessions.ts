import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionsQueryOptions } from "../../../adapters/queries/sessions";

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["sessions", "revoke-others"],
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message ?? "Failed to revoke sessions");
    },
    onSuccess: async () => {
      toast.success("Other sessions revoked");
      await queryClient.invalidateQueries({
        queryKey: sessionsQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) => toast.error(err.message),
  });
}
