import { isPersonalOrg } from "@packages/access-control";
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
import { createRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { orgScopeLayout } from "../../router/layouts";
import { deleteOrgMutationOptions } from "../../shared/api/mutations/delete-org";
import { leaveOrgMutationOptions } from "../../shared/api/mutations/leave-org";
import { transferAndLeaveMutationOptions } from "../../shared/api/mutations/transfer-and-leave";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { currentMembershipQueryOptions } from "../../shared/api/queries/current-membership";
import { orgMembersQueryOptions } from "../../shared/api/queries/org-members";
import { orgsListQueryOptions } from "../../shared/api/queries/orgs-list";
import { broadcastAuthChange } from "../../shared/auth/auth-broadcast";
import { Can } from "../../shared/auth/can";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { useAuthorization } from "../../shared/auth/use-authorization";
import { useSetActiveOrg } from "../../shared/auth/use-set-active-org";
import { toastError } from "../../shared/utils";
import { TransferLeaveDialog } from "./components/transfer-leave-dialog";
import { UpdateOrgForm } from "./forms/update-org-form";

export const generalRoute = createRoute({
  getParentRoute: () => orgScopeLayout,
  path: "general",
  beforeLoad: ensureOrgPermission({ organization: ["update"] }),
  component: GeneralPage,
});

function GeneralPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { role } = useAuthorization();
  const { switchOrg } = useSetActiveOrg();
  const { data: membership } = useQuery(currentMembershipQueryOptions);
  const { data: members = [] } = useQuery(
    org ? orgMembersQueryOptions(org.id) : { ...orgMembersQueryOptions(""), enabled: false },
  );

  const onLeaveSuccess = async () => {
    const orgs = await queryClient.fetchQuery(orgsListQueryOptions);
    if (orgs[0]) await switchOrg(orgs[0].id);
    toast.success("Left organization");
    void navigate({ to: "/dashboard" });
  };

  const leave = useMutation({
    ...leaveOrgMutationOptions,
    onSuccess: onLeaveSuccess,
    onError: (err) => toastError(err, "Failed to leave"),
  });

  const transferAndLeave = useMutation({
    ...transferAndLeaveMutationOptions,
    onSuccess: onLeaveSuccess,
    onError: (err) => toastError(err, "Failed to transfer and leave"),
  });

  const remove = useMutation({
    ...deleteOrgMutationOptions,
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
        queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
      ]);
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
