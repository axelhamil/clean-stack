import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { acceptPoliciesMutationOptions } from "../../../shared/api/mutations/accept-policies";
import { policiesQueryOptions } from "../../../shared/api/queries/policies";

export function useAcceptPolicies(redirect?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    ...acceptPoliciesMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: policiesQueryOptions.queryKey });
      toast.success("Policies accepted — welcome!");
      void navigate({ to: redirect ?? "/dashboard" });
    },
    onError: (err) => toast.error(err.message),
  });
}
