import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyH2 } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { broadcastAuthChange } from "../../adapters/auth-broadcast";
import { deleteOrgMutationOptions } from "../../adapters/mutations/delete-org";
import { leaveOrgMutationOptions } from "../../adapters/mutations/leave-org";
import { activeOrgQueryOptions } from "../../adapters/queries/active-org";
import { currentMembershipQueryOptions } from "../../adapters/queries/current-membership";
import { orgsListQueryOptions } from "../../adapters/queries/orgs-list";
import { UpdateOrgForm } from "./_forms/update-org-form";

export function OrgSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const { data: membership } = useQuery(currentMembershipQueryOptions);
  const leave = useMutation(leaveOrgMutationOptions);
  const remove = useMutation(deleteOrgMutationOptions);

  if (!org) {
    return (
      <main className="p-6">
        <p>No active organization.</p>
      </main>
    );
  }

  const role = membership?.role;
  const canEdit = role === "owner" || role === "admin";
  const canDelete = role === "owner";
  const canLeave = role !== "owner";

  const refetchAll = () =>
    Promise.all([
      queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
      queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
    ]);

  const onLeave = async () => {
    try {
      await leave.mutateAsync({ organizationId: org.id });
      await refetchAll();
      broadcastAuthChange();
      toast.success("Left organization");
      void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave");
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync({ organizationId: org.id });
      await refetchAll();
      broadcastAuthChange();
      toast.success("Organization deleted");
      void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <TypographyH1>Organization settings</TypographyH1>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Rename your organization or update its slug.</CardDescription>
          </CardHeader>
          <CardContent>
            <UpdateOrgForm
              organizationId={org.id}
              defaultValues={{ name: org.name, slug: org.slug }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Irreversible actions.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {canLeave && (
            <Button variant="outline" onClick={() => void onLeave()} disabled={leave.isPending}>
              Leave organization
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              onClick={() => void onDelete()}
              disabled={remove.isPending}
            >
              Delete organization
            </Button>
          )}
        </CardContent>
      </Card>

      <TypographyH2 className="text-muted-foreground text-sm">
        Role: {role ?? "loading…"}
      </TypographyH2>
    </main>
  );
}
