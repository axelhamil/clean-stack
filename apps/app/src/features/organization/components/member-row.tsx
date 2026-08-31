import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { removeMemberMutationOptions } from "../../../shared/api/mutations/remove-member";
import { updateMemberRoleMutationOptions } from "../../../shared/api/mutations/update-member-role";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { orgMembersQueryOptions } from "../../../shared/api/queries/org-members";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { ROLE_LABEL_KEYS } from "../role-labels";

export interface MemberRowProps {
  member: {
    id: string;
    role: "owner" | "admin" | "member";
    user: { id: string; email: string; name: string | null };
  };
  organizationId: string;
  isCurrentUser: boolean;
}

export function MemberRow({ member, organizationId, isCurrentUser }: MemberRowProps) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const { can } = useAuthorization();
  const canManage = can({ member: ["update", "delete"] }) && !isCurrentUser;

  const refetchAll = () =>
    Promise.all([
      queryClient.refetchQueries({ queryKey: orgMembersQueryOptions(organizationId).queryKey }),
      queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
    ]);

  const updateRole = useMutation({
    ...updateMemberRoleMutationOptions,
    onSuccess: async () => {
      await refetchAll();
      broadcastAuthChange();
      toast.success(t("organization.roleUpdatedToast"));
    },
    onError: (err) => toastError(err, t("organization.updateRoleFailed")),
  });

  const remove = useMutation({
    ...removeMemberMutationOptions,
    onSuccess: async () => {
      await refetchAll();
      broadcastAuthChange();
      toast.success(t("organization.memberRemovedToast"));
    },
    onError: (err) => toastError(err, t("organization.removeMemberFailed")),
  });

  return (
    <ListRow>
      <ListRowContent>
        <TypographyP>{member.user.name ?? member.user.email}</TypographyP>
        <TypographyMuted>{member.user.email}</TypographyMuted>
      </ListRowContent>
      <ListRowAction>
        {canManage ? (
          <Select
            value={member.role}
            onValueChange={(v) =>
              updateRole.mutate({
                memberId: member.id,
                role: v as "owner" | "admin" | "member",
                organizationId,
              })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">{t(`common:${ROLE_LABEL_KEYS.member}`)}</SelectItem>
              <SelectItem value="admin">{t(`common:${ROLE_LABEL_KEYS.admin}`)}</SelectItem>
              <SelectItem value="owner">{t(`common:${ROLE_LABEL_KEYS.owner}`)}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{t(`common:${ROLE_LABEL_KEYS[member.role]}`)}</Badge>
        )}
        {canManage && (
          <DestructiveActionDialog
            trigger={
              <Button variant="destructive" size="sm" disabled={remove.isPending}>
                {t("organization.removeAction")}
              </Button>
            }
            title={t("organization.removeMemberDialogTitle")}
            description={
              <Trans
                ns="settings"
                i18nKey="organization.removeMemberDescription"
                components={{
                  userName: <strong>{member.user.name ?? member.user.email}</strong>,
                }}
              />
            }
            actionLabel={t("organization.removeMemberDialogTitle")}
            isPending={remove.isPending}
            onConfirm={() => remove.mutate({ memberIdOrEmail: member.id, organizationId })}
          />
        )}
      </ListRowAction>
    </ListRow>
  );
}
