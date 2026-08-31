import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { cancelInvitationMutationOptions } from "../../../shared/api/mutations/cancel-invitation";
import { orgInvitationsQueryOptions } from "../../../shared/api/queries/org-invitations";
import { isOrgRole, ROLE_LABEL_KEYS } from "../../../shared/auth/role-labels";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import { INVITATION_STATUS_LABEL_KEYS, isInvitationStatus } from "../invitation-status-labels";

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
  const { t } = useTranslation(["settings", "common"]);
  const formatDate = useFormatDate();
  const queryClient = useQueryClient();
  const { can } = useAuthorization();
  const canCancel = can({ invitation: ["cancel"] });

  const cancel = useMutation({
    ...cancelInvitationMutationOptions,
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: orgInvitationsQueryOptions(organizationId).queryKey,
      });
      toast.success(t("organization.invitationCancelledToast"));
    },
    onError: (err) => toastError(err, t("organization.cancelInvitationFailed")),
  });

  return (
    <ListRow>
      <ListRowContent>
        <TypographyP>{invitation.email}</TypographyP>
        <TypographyMuted>
          {t("organization.invitationExpiry", {
            role: isOrgRole(invitation.role)
              ? t(ROLE_LABEL_KEYS[invitation.role])
              : invitation.role,
            date: formatDate(invitation.expiresAt),
          })}
        </TypographyMuted>
      </ListRowContent>
      <ListRowAction>
        <Badge variant="outline">
          {isInvitationStatus(invitation.status)
            ? t(INVITATION_STATUS_LABEL_KEYS[invitation.status])
            : invitation.status}
        </Badge>
        {canCancel && invitation.status === "pending" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancel.mutate({ invitationId: invitation.id })}
            disabled={cancel.isPending}
          >
            {t("common:actions.cancel")}
          </Button>
        )}
      </ListRowAction>
    </ListRow>
  );
}
