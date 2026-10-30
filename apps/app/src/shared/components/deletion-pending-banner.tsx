import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { GuardHint } from "../auth/guard-hint";
import { ImpersonationReason } from "../auth/impersonation-reason";
import { useCancelDeletion } from "../auth/use-cancel-deletion";
import { useImpersonationGuard } from "../auth/use-impersonation-guard";
import { useFormatDateTime } from "../i18n/use-format-date";

export function DeletionPendingBanner() {
  const { t } = useTranslation("settings");
  const { data: session } = useQuery(sessionQueryOptions);
  const cancel = useCancelDeletion();
  const guard = useImpersonationGuard();
  const formatDateTime = useFormatDateTime();
  const until = session?.user.pendingDeletionUntil;

  if (!until) return null;

  return (
    <Alert variant="banner">
      <AlertTriangleIcon />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="min-w-0 break-words">
          {t("deletion.scheduledDescription", { date: formatDateTime(new Date(until)) })}
        </span>
        <GuardHint guard={guard} otherwiseDisabled={cancel.isPending}>
          <Button
            variant="secondary"
            size="sm"
            disabled={cancel.isPending || guard.blocked}
            {...guard.describeProps(cancel.isPending)}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? t("deletion.cancelling") : t("deletion.cancel")}
          </Button>
        </GuardHint>
        <ImpersonationReason guard={guard} />
      </AlertDescription>
    </Alert>
  );
}
