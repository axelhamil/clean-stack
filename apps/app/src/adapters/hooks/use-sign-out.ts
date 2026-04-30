import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { broadcastAuthChange } from "../auth-broadcast";
import { authClient } from "../auth-client";
import { sessionQueryOptions } from "../queries/session";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationKey: ["session", "sign-out"],
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    onSuccess: async () => {
      toast.success("Signed out");
      queryClient.setQueryData(sessionQueryOptions.queryKey, null);

      broadcastAuthChange();

      void navigate({ to: "/sign-in" });
    },
    onError: (err) => toast.error(err.message),
  });
}
