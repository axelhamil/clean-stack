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
import { useTranslation } from "react-i18next";
import { toastError } from "../../../shared/api/errors/toast";
import { preflightDeletionQueryOptions } from "../../../shared/api/queries/account-deletion";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { useSetActiveOrg } from "../../../shared/auth/use-set-active-org";
import { useFormatDate, useFormatDateTime } from "../../../shared/i18n/use-format-date";
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
  const { t } = useTranslation("settings");
  const formatDate = useFormatDate();
  const formatDateTime = useFormatDateTime();
  const cancel = useCancelDeletion();
  const guard = useImpersonationGuard();
  return (
    <Card>
      <CardHeader>
        <CardTitle variant="destructive">{t("deletion.scheduledTitle")}</CardTitle>
        <CardDescription>
          {t("deletion.scheduledDescription", { date: formatDateTime(until) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>
            {t("deletion.anonymizedWarning", { date: formatDate(until) })}
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={cancel.isPending || guard.blocked}
          {...guard.describeProps(cancel.isPending)}
          onClick={() => cancel.mutate()}
        >
          {cancel.isPending ? t("deletion.cancelling") : t("deletion.cancel")}
        </Button>
        <ImpersonationReason guard={guard} />
      </CardContent>
    </Card>
  );
}

interface ActiveStateProps {
  twoFactorEnabled: boolean;
}

function ActiveState({ twoFactorEnabled }: ActiveStateProps) {
  const { t } = useTranslation("settings");
  const preflight = useQuery(preflightDeletionQueryOptions);

  return (
    <Card>
      <CardHeader>
        <CardTitle variant="destructive">{t("deletion.title")}</CardTitle>
        <CardDescription>{t("deletion.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {preflight.isPending ? (
          <TypographyMuted>{t("deletion.checking")}</TypographyMuted>
        ) : preflight.isError ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>{t("deletion.checkFailed")}</AlertDescription>
          </Alert>
        ) : preflight.data.blockingOrgs.length > 0 ? (
          <BlockingOrgsList orgs={preflight.data.blockingOrgs} />
        ) : (
          <>
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertDescription>{t("deletion.warning")}</AlertDescription>
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
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const { switchOrg } = useSetActiveOrg();

  const resolveOrg = async (orgId: string) => {
    try {
      await switchOrg(orgId);
    } catch (err) {
      toastError(err, t("deletion.switchOrgFailed"));
      return;
    }
    void navigate({ to: "/settings/organization" });
  };

  return (
    <div className="flex flex-col gap-3">
      <TypographyMuted>{t("deletion.blockingIntro")}</TypographyMuted>
      <ul className="flex flex-col gap-2">
        {orgs.map((org) => (
          <ListRow key={org.orgId}>
            <ListRowContent>
              <TypographyLarge>{org.orgName}</TypographyLarge>
              <TypographyMuted>
                {t("deletion.otherMembers", { count: org.otherMembersCount })}
              </TypographyMuted>
            </ListRowContent>
            <ListRowAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void resolveOrg(org.orgId)}
              >
                {t("deletion.resolve")}
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
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" className="self-start">
          <TrashIcon />
          {t("deletion.title")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deletion.dialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deletion.dialogDescription")}</AlertDialogDescription>
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
