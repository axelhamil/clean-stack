import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
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
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import { TypographyLarge, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangleIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { preflightDeletionQueryOptions } from "../../../shared/api/queries/account-deletion";
import { useSetActiveOrg } from "../../../shared/auth/use-set-active-org";
import { toastError } from "../../../shared/utils";
import { RequestDeletionPasswordForm } from "../forms/request-deletion-password-form";
import { RequestDeletionTotpForm } from "../forms/request-deletion-totp-form";
import { useCancelDeletion } from "../hooks/use-cancel-deletion";

interface RgpdDeletionCardProps {
  pendingDeletionUntil: Date | string | null | undefined;
  twoFactorEnabled: boolean;
}

export function RgpdDeletionCard({
  pendingDeletionUntil,
  twoFactorEnabled,
}: RgpdDeletionCardProps) {
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
    <Card>
      <CardHeader>
        <CardTitle variant="destructive">Account deletion scheduled</CardTitle>
        <CardDescription>
          Your account is scheduled for deletion on {until.toLocaleString()}. You can cancel any
          time before then.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>
            After {until.toLocaleDateString()}, your data will be anonymized and cannot be
            recovered.
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          variant="outline"
          className="self-start"
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

  return (
    <Card>
      <CardHeader>
        <CardTitle variant="destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently anonymizes your data after a 7-day grace period. RGPD Art. 17 (right to
          erasure).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {preflight.isPending ? (
          <TypographyMuted>Checking account status…</TypographyMuted>
        ) : preflight.isError ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>
              Could not verify account status. Refresh the page and try again.
            </AlertDescription>
          </Alert>
        ) : preflight.data.blockingOrgs.length > 0 ? (
          <BlockingOrgsList orgs={preflight.data.blockingOrgs} />
        ) : (
          <>
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertDescription>
                Deleting your account will anonymize all your data after a 7-day grace period. This
                action cannot be undone after that period.
              </AlertDescription>
            </Alert>
            <DeleteDialog twoFactorEnabled={twoFactorEnabled} />
          </>
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
  const { switchOrg } = useSetActiveOrg();

  const resolveOrg = async (orgId: string) => {
    try {
      await switchOrg(orgId);
    } catch (err) {
      toastError(err, "Failed to switch organization");
      return;
    }
    void navigate({ to: "/settings/organization" });
  };

  return (
    <div className="flex flex-col gap-3">
      <TypographyMuted>
        You are the only owner of these organizations. Transfer ownership or delete each one before
        you can delete your account.
      </TypographyMuted>
      <ul className="flex flex-col gap-2">
        {orgs.map((org) => (
          <ListRow key={org.orgId}>
            <ListRowContent>
              <TypographyLarge>{org.orgName}</TypographyLarge>
              <TypographyMuted>
                {org.otherMembersCount} other member{org.otherMembersCount === 1 ? "" : "s"}
              </TypographyMuted>
            </ListRowContent>
            <ListRowAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void resolveOrg(org.orgId)}
              >
                Resolve
              </Button>
            </ListRowAction>
          </ListRow>
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
