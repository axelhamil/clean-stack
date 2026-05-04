import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sessionsQueryOptions } from "../../../shared/api/queries/sessions";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["sessions", "revoke"],
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token });
      if (error) throw new Error(error.message ?? "Failed to revoke session");
    },
    onSuccess: async () => {
      toast.success("Session revoked");
      await queryClient.invalidateQueries({
        queryKey: sessionsQueryOptions.queryKey,
      });
      broadcastAuthChange();
    },
    onError: (err) => toast.error(err.message),
  });
}
