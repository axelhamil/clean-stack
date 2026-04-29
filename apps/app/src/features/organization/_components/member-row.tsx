import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
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
import { removeMemberMutationOptions } from "../../../adapters/mutations/remove-member";
import { updateMemberRoleMutationOptions } from "../../../adapters/mutations/update-member-role";
import { activeOrgQueryOptions } from "../../../adapters/queries/active-org";
import { orgMembersQueryOptions } from "../../../adapters/queries/org-members";

export interface MemberRowProps {
  member: {
    id: string;
    role: "owner" | "admin" | "member";
    user: { id: string; email: string; name: string | null };
  };
  organizationId: string;
  canEdit: boolean;
}

export function MemberRow({ member, organizationId, canEdit }: MemberRowProps) {
  const queryClient = useQueryClient();
  const updateRole = useMutation(updateMemberRoleMutationOptions);
  const remove = useMutation(removeMemberMutationOptions);

  const refetchAll = () =>
    Promise.all([
      queryClient.refetchQueries({ queryKey: orgMembersQueryOptions(organizationId).queryKey }),
      queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
    ]);

  const onRoleChange = async (role: "owner" | "admin" | "member") => {
    try {
      await updateRole.mutateAsync({ memberId: member.id, role, organizationId });
      await refetchAll();
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const onRemove = async () => {
    try {
      await remove.mutateAsync({ memberIdOrEmail: member.id, organizationId });
      await refetchAll();
      toast.success("Member removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  return (
    <ListRow>
      <ListRowContent>
        <TypographyP>{member.user.name ?? member.user.email}</TypographyP>
        <TypographyMuted>{member.user.email}</TypographyMuted>
      </ListRowContent>
      <ListRowAction>
        {canEdit ? (
          <Select
            value={member.role}
            onValueChange={(v) => void onRoleChange(v as "owner" | "admin" | "member")}
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
        {canEdit && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void onRemove()}
            disabled={remove.isPending}
          >
            Remove
          </Button>
        )}
      </ListRowAction>
    </ListRow>
  );
}
