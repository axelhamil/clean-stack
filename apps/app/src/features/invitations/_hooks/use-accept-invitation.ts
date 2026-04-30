import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { acceptInvitationMutationOptions } from "../../../adapters/mutations/accept-invitation";
import { activeOrgQueryOptions } from "../../../adapters/queries/active-org";
import { orgsListQueryOptions } from "../../../adapters/queries/orgs-list";
import { sessionQueryOptions } from "../../../adapters/queries/session";
import { toastError } from "../../../common/toast-error";

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    ...acceptInvitationMutationOptions,
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey }),
        queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
        queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
      ]);
      broadcastAuthChange();
      toast.success("Invitation accepted");
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, "Failed to accept invitation"),
  });
}
