import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { authClient } from "../../../shared/auth/auth-client";

export function useVerifyMagicLink() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ["session", "magic-link-verify"],
    mutationFn: async (token: string) => {
      const { data, error } = await authClient.magicLink.verify({
        query: { token },
      });
      if (error) throw new Error(error.message ?? "Invalid or expired link");

      return data;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: sessionQueryOptions.queryKey,
      });

      broadcastAuthChange();

      void navigate({ to: "/" });
    },
  });
}
