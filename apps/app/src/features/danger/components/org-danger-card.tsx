import { isPersonalOrg } from "@packages/access-control";
import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteOrgMutationOptions } from "../../../shared/api/mutations/delete-org";
import { leaveOrgMutationOptions } from "../../../shared/api/mutations/leave-org";
import { transferAndLeaveMutationOptions } from "../../../shared/api/mutations/transfer-and-leave";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { currentMembershipQueryOptions } from "../../../shared/api/queries/current-membership";
import { orgMembersQueryOptions } from "../../../shared/api/queries/org-members";
import { orgsListQueryOptions } from "../../../shared/api/queries/orgs-list";
import { broadcastAuthChange } from "../../../shared/auth/auth-broadcast";
import { Can } from "../../../shared/auth/can";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import { useSetActiveOrg } from "../../../shared/auth/use-set-active-org";
import { toastError } from "../../../shared/utils";
import { TransferLeaveDialog } from "./transfer-leave-dialog";

export function OrgDangerCard() {
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
    if (orgs[0]) {
      await switchOrg(orgs[0].id);
    } else {
      broadcastAuthChange();
    }
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

  if (!org) return null;

  const owners = members.filter((m) => m.role === "owner");
  const needsTransfer = role === "owner" && owners.length === 1 && members.length > 1;
  const personal = isPersonalOrg(org.slug);

  return (
    <>
      {!personal && (
        <Can requires={{ organization: ["leave"] }}>
          <Card>
            <CardHeader>
              <CardTitle variant="destructive">Leave organization</CardTitle>
              <CardDescription>You will lose access to its resources.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertTriangleIcon />
                <AlertDescription>
                  You will lose access to <strong>{org.name}</strong> and all its resources. You
                  will need a new invitation to rejoin.
                </AlertDescription>
              </Alert>
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
                    <Button
                      variant="destructive"
                      className="self-start"
                      disabled={transferAndLeave.isPending}
                    >
                      Leave organization
                    </Button>
                  }
                />
              ) : (
                <DestructiveActionDialog
                  trigger={
                    <Button variant="destructive" className="self-start" disabled={leave.isPending}>
                      Leave organization
                    </Button>
                  }
                  title="Leave organization"
                  description={
                    <>
                      You will lose access to <strong>{org.name}</strong> and its resources.
                    </>
                  }
                  actionLabel="Leave organization"
                  isPending={leave.isPending}
                  onConfirm={() => leave.mutate({ organizationId: org.id })}
                />
              )}
            </CardContent>
          </Card>
        </Can>
      )}
      <Can requires={{ organization: ["delete"] }}>
        <Card>
          <CardHeader>
            <CardTitle variant="destructive">Delete organization</CardTitle>
            <CardDescription>
              {personal
                ? "Personal organizations cannot be deleted."
                : "All members, invitations, and data will be permanently removed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {personal ? (
              <TypographyMuted>
                Delete your account below to remove this organization.
              </TypographyMuted>
            ) : (
              <>
                <Alert variant="destructive">
                  <AlertTriangleIcon />
                  <AlertDescription>
                    Deleting <strong>{org.name}</strong> will permanently delete all members,
                    invitations, and data. This action cannot be undone.
                  </AlertDescription>
                </Alert>
                <DestructiveActionDialog
                  trigger={
                    <Button
                      variant="destructive"
                      className="self-start"
                      disabled={remove.isPending}
                    >
                      Delete organization
                    </Button>
                  }
                  title="Delete organization"
                  description="This action cannot be undone. All members, invitations, and data attached to this organization will be permanently removed."
                  confirmText={org.name}
                  actionLabel="Delete organization"
                  isPending={remove.isPending}
                  onConfirm={() => remove.mutate({ organizationId: org.id })}
                />
              </>
            )}
          </CardContent>
        </Card>
      </Can>
    </>
  );
}
