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
import { toast } from "sonner";
import { removeMemberMutationOptions } from "../../../shared/api/mutations/remove-member";
import { updateMemberRoleMutationOptions } from "../../../shared/api/mutations/update-member-role";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { orgMembersQueryOptions } from "../../../shared/api/queries/org-members";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { toastError } from "../../../shared/utils";

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
      toast.success("Role updated");
    },
    onError: (err) => toastError(err, "Failed to update role"),
  });

  const remove = useMutation({
    ...removeMemberMutationOptions,
    onSuccess: async () => {
      await refetchAll();
      broadcastAuthChange();
      toast.success("Member removed");
    },
    onError: (err) => toastError(err, "Failed to remove member"),
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
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{member.role}</Badge>
        )}
        {canManage && (
          <DestructiveActionDialog
            trigger={
              <Button variant="destructive" size="sm" disabled={remove.isPending}>
                Remove
              </Button>
            }
            title="Remove member"
            description={
              <>
                <strong>{member.user.name ?? member.user.email}</strong> will lose access to this
                organization. This cannot be undone.
              </>
            }
            actionLabel="Remove member"
            isPending={remove.isPending}
            onConfirm={() => remove.mutate({ memberIdOrEmail: member.id, organizationId })}
          />
        )}
      </ListRowAction>
    </ListRow>
  );
}
