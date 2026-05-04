import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { acceptInvitationMutationOptions } from "../../../shared/api/mutations/accept-invitation";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { orgsListQueryOptions } from "../../../shared/api/queries/orgs-list";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { toastError } from "../../../shared/utils";

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
