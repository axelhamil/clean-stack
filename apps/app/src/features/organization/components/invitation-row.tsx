import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelInvitationMutationOptions } from "../../../shared/api/mutations/cancel-invitation";
import { orgInvitationsQueryOptions } from "../../../shared/api/queries/org-invitations";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { formatDate, toastError } from "../../../shared/utils";

export interface InvitationRowProps {
  invitation: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string | Date;
  };
  organizationId: string;
}

export function InvitationRow({ invitation, organizationId }: InvitationRowProps) {
  const queryClient = useQueryClient();
  const { can } = useAuthorization();
  const canCancel = can({ invitation: ["cancel"] });

  const cancel = useMutation({
    ...cancelInvitationMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orgInvitationsQueryOptions(organizationId).queryKey,
      });
      toast.success("Invitation cancelled");
    },
    onError: (err) => toastError(err, "Failed to cancel invitation"),
  });

  return (
    <ListRow>
      <ListRowContent>
        <TypographyP>{invitation.email}</TypographyP>
        <TypographyMuted>
          {invitation.role} · expires {formatDate(invitation.expiresAt)}
        </TypographyMuted>
      </ListRowContent>
      <ListRowAction>
        <Badge variant="outline">{invitation.status}</Badge>
        {canCancel && invitation.status === "pending" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancel.mutate({ invitationId: invitation.id })}
            disabled={cancel.isPending}
          >
            Cancel
          </Button>
        )}
      </ListRowAction>
    </ListRow>
  );
}
