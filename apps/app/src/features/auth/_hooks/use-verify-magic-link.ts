import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { authClient } from "../../../adapters/auth-client";
import { sessionQueryOptions } from "../../../adapters/queries/session";

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
