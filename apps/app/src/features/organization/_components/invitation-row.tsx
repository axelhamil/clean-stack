import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelInvitationMutationOptions } from "../../../adapters/mutations/cancel-invitation";
import { orgInvitationsQueryOptions } from "../../../adapters/queries/org-invitations";

export interface InvitationRowProps {
  invitation: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string | Date;
  };
  organizationId: string;
  canCancel: boolean;
}

export function InvitationRow({ invitation, organizationId, canCancel }: InvitationRowProps) {
  const queryClient = useQueryClient();
  const cancel = useMutation(cancelInvitationMutationOptions);

  const onCancel = async () => {
    try {
      await cancel.mutateAsync({ invitationId: invitation.id });
      await queryClient.refetchQueries({
        queryKey: orgInvitationsQueryOptions(organizationId).queryKey,
      });
      toast.success("Invitation cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel invitation");
    }
  };

  return (
    <ListRow>
      <ListRowContent>
        <TypographyP>{invitation.email}</TypographyP>
        <TypographyMuted>
          {invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </TypographyMuted>
      </ListRowContent>
      <ListRowAction>
        <Badge variant="outline">{invitation.status}</Badge>
        {canCancel && invitation.status === "pending" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onCancel()}
            disabled={cancel.isPending}
          >
            Cancel
          </Button>
        )}
      </ListRowAction>
    </ListRow>
  );
}
