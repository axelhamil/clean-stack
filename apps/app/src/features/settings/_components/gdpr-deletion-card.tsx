import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@packages/ui/components/ui/alert-dialog";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangleIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "../../../adapters/auth-client";
import { preflightDeletionQueryOptions } from "../../../adapters/queries/account-deletion";
import { RequestDeletionPasswordForm } from "../_forms/request-deletion-password-form";
import { RequestDeletionTotpForm } from "../_forms/request-deletion-totp-form";
import { useCancelDeletion } from "../_hooks/use-cancel-deletion";

interface GdprDeletionCardProps {
  pendingDeletionUntil: Date | string | null | undefined;
  twoFactorEnabled: boolean;
}

export function GdprDeletionCard({
  pendingDeletionUntil,
  twoFactorEnabled,
}: GdprDeletionCardProps) {
  if (pendingDeletionUntil) {
    return <PendingState until={new Date(pendingDeletionUntil)} />;
  }
  return <ActiveState twoFactorEnabled={twoFactorEnabled} />;
}

interface PendingStateProps {
  until: Date;
}

function PendingState({ until }: PendingStateProps) {
  const cancel = useCancelDeletion();
  return (
    <Card variant="destructive">
      <CardHeader>
        <CardTitle variant="destructive" className="flex items-center gap-2">
          <AlertTriangleIcon className="size-4" />
          Account deletion scheduled
        </CardTitle>
        <CardDescription>
          Your account is scheduled for deletion on {until.toLocaleString()}. You can cancel any
          time before then.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          {cancel.isPending ? "Cancelling…" : "Cancel deletion"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ActiveStateProps {
  twoFactorEnabled: boolean;
}

function ActiveState({ twoFactorEnabled }: ActiveStateProps) {
  const preflight = useQuery(preflightDeletionQueryOptions);
  const blockingOrgs = preflight.data?.blockingOrgs ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently anonymizes your data after a 7-day grace period. GDPR Art. 17 (right to
          erasure).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {blockingOrgs.length > 0 ? (
          <BlockingOrgsList orgs={blockingOrgs} />
        ) : (
          <DeleteDialog twoFactorEnabled={twoFactorEnabled} />
        )}
      </CardContent>
    </Card>
  );
}

interface BlockingOrgsListProps {
  orgs: readonly { orgId: string; orgName: string; otherMembersCount: number }[];
}

function BlockingOrgsList({ orgs }: BlockingOrgsListProps) {
  const navigate = useNavigate();

  const resolveOrg = async (orgId: string) => {
    const { error } = await authClient.organization.setActive({ organizationId: orgId });
    if (error) {
      toast.error(error.message ?? "Failed to switch organization");
      return;
    }
    void navigate({ to: "/settings/general" });
  };

  return (
    <div className="flex flex-col gap-3">
      <TypographyMuted>
        You are the only owner of these organizations. Transfer ownership or delete each one before
        you can delete your account.
      </TypographyMuted>
      <ul className="flex flex-col gap-2">
        {orgs.map((org) => (
          <li
            key={org.orgId}
            className="flex items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{org.orgName}</span>
              <TypographyMuted>
                {org.otherMembersCount} other member{org.otherMembersCount === 1 ? "" : "s"}
              </TypographyMuted>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void resolveOrg(org.orgId)}
            >
              Resolve
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface DeleteDialogProps {
  twoFactorEnabled: boolean;
}

function DeleteDialog({ twoFactorEnabled }: DeleteDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" className="self-start">
          <TrashIcon />
          Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account</AlertDialogTitle>
          <AlertDialogDescription>
            Your data will be anonymized after a 7-day grace period. You can cancel any time during
            those 7 days by signing in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {twoFactorEnabled ? (
          <RequestDeletionTotpForm onClose={() => setOpen(false)} />
        ) : (
          <RequestDeletionPasswordForm onClose={() => setOpen(false)} />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
