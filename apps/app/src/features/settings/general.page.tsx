import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  TypographyH1,
  TypographyMuted,
  TypographySmall,
} from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../adapters/auth-broadcast";
import { Can } from "../../adapters/components/can";
import { useAuthorization } from "../../adapters/hooks/use-authorization";
import { deleteOrgMutationOptions } from "../../adapters/mutations/delete-org";
import { leaveOrgMutationOptions } from "../../adapters/mutations/leave-org";
import { transferAndLeaveMutationOptions } from "../../adapters/mutations/transfer-and-leave";
import { activeOrgQueryOptions } from "../../adapters/queries/active-org";
import { currentMembershipQueryOptions } from "../../adapters/queries/current-membership";
import { orgMembersQueryOptions } from "../../adapters/queries/org-members";
import { orgsListQueryOptions } from "../../adapters/queries/orgs-list";
import { isPersonalOrg } from "../../common/is-personal-org";
import { toastError } from "../../common/toast-error";
import { TransferLeaveDialog } from "./_components/transfer-leave-dialog";
import { UpdateOrgForm } from "./_forms/update-org-form";
import { switchToFirstRemainingOrg } from "./_helpers/switch-to-first-org";

export function SettingsGeneralPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { role } = useAuthorization();
  const { data: membership } = useQuery(currentMembershipQueryOptions);
  const { data: members = [] } = useQuery(
    org ? orgMembersQueryOptions(org.id) : { ...orgMembersQueryOptions(""), enabled: false },
  );

  const refetchAll = () =>
    Promise.all([
      queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
      queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
    ]);

  const leave = useMutation({
    ...leaveOrgMutationOptions,
    onSuccess: async () => {
      await refetchAll();
      await switchToFirstRemainingOrg(queryClient);
      broadcastAuthChange();
      toast.success("Left organization");
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, "Failed to leave"),
  });

  const transferAndLeave = useMutation({
    ...transferAndLeaveMutationOptions,
    onSuccess: async () => {
      await refetchAll();
      await switchToFirstRemainingOrg(queryClient);
      broadcastAuthChange();
      toast.success("Left organization");
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, "Failed to transfer and leave"),
  });

  const remove = useMutation({
    ...deleteOrgMutationOptions,
    onSuccess: async () => {
      await refetchAll();
      broadcastAuthChange();
      toast.success("Organization deleted");
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toastError(err, "Failed to delete"),
  });

  if (!org) return <TypographyMuted>No active organization.</TypographyMuted>;

  const owners = members.filter((m) => m.role === "owner");
  const needsTransfer = role === "owner" && owners.length === 1 && members.length > 1;

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Organization settings</TypographyH1>
      <Can requires={{ organization: ["update"] }}>
        <Card>
          <CardHeader>
            <CardTitle>Organization details</CardTitle>
            <CardDescription>Rename your organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <UpdateOrgForm organizationId={org.id} defaultValues={{ name: org.name }} />
          </CardContent>
        </Card>
      </Can>

      <Card>
        <CardHeader>
          <CardTitle variant="destructive">Danger zone</CardTitle>
          <CardDescription>Irreversible actions for this organization.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!isPersonalOrg(org.slug) && (
            <Can requires={{ organization: ["leave"] }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <TypographySmall>Leave organization</TypographySmall>
                  <TypographyMuted>You will lose access to its resources.</TypographyMuted>
                </div>
                {needsTransfer ? (
                  <TransferLeaveDialog
                    org={{ id: org.id, name: org.name }}
                    members={members}
                    currentUserId={membership?.userId ?? ""}
                    isPending={transferAndLeave.isPending}
                    onConfirm={(newOwnerMemberId) =>
                      transferAndLeave.mutate({ organizationId: org.id, newOwnerMemberId })
                    }
                    trigger={
                      <Button variant="outline" disabled={transferAndLeave.isPending}>
                        Leave
                      </Button>
                    }
                  />
                ) : (
                  <DestructiveActionDialog
                    trigger={
                      <Button variant="outline" disabled={leave.isPending}>
                        Leave
                      </Button>
                    }
                    title="Leave organization"
                    description={
                      <>
                        You will lose access to <span className="font-semibold">{org.name}</span>{" "}
                        and its resources.
                      </>
                    }
                    actionLabel="Leave organization"
                    isPending={leave.isPending}
                    onConfirm={() => leave.mutate({ organizationId: org.id })}
                  />
                )}
              </div>
            </Can>
          )}
          <Can requires={{ organization: ["delete"] }}>
            {isPersonalOrg(org.slug) ? (
              <div className="flex flex-col">
                <TypographySmall>Delete organization</TypographySmall>
                <TypographyMuted>
                  Personal organizations cannot be deleted. Delete your account from Settings →
                  Account to remove this organization.
                </TypographyMuted>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <TypographySmall>Delete organization</TypographySmall>
                  <TypographyMuted>All members and data will be removed.</TypographyMuted>
                </div>
                <DestructiveActionDialog
                  trigger={
                    <Button variant="destructive" disabled={remove.isPending}>
                      Delete
                    </Button>
                  }
                  title="Delete organization"
                  description="This action cannot be undone. All members, invitations, and data attached to this organization will be permanently removed."
                  confirmText={org.name}
                  actionLabel="Delete organization"
                  isPending={remove.isPending}
                  onConfirm={() => remove.mutate({ organizationId: org.id })}
                />
              </div>
            )}
          </Can>
        </CardContent>
      </Card>
    </main>
  );
}
