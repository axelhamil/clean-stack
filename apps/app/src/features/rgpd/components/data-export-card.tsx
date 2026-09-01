import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { useFormatDateTime } from "../../../shared/i18n/use-format-date";
import { useRequestExport } from "../hooks/use-request-export";

const RATE_LIMIT_HOURS = 24;

interface DataExportCardProps {
  lastExportRequestedAt: Date | string | null | undefined;
}

export function DataExportCard({ lastExportRequestedAt }: DataExportCardProps) {
  const formatDateTime = useFormatDateTime();
  const { t } = useTranslation("settings");
  const mutation = useRequestExport();
  const guard = useImpersonationGuard();

  const last = lastExportRequestedAt ? new Date(lastExportRequestedAt) : null;
  const nextAllowedAt = last ? new Date(last.getTime() + RATE_LIMIT_HOURS * 60 * 60 * 1000) : null;
  const cooldown = Boolean(nextAllowedAt && nextAllowedAt > new Date());
  const otherwiseDisabled = mutation.isPending || cooldown;
  const impersonationFrozen = guard.blocked && !otherwiseDisabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dataExport.title")}</CardTitle>
        <CardDescription>{t("dataExport.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={otherwiseDisabled || guard.blocked}
          title={impersonationFrozen ? guard.reason : undefined}
          aria-describedby={impersonationFrozen ? guard.descriptionId : undefined}
          onClick={() => mutation.mutate()}
        >
          <DownloadIcon />
          {mutation.isPending ? t("dataExport.requesting") : t("dataExport.request")}
        </Button>
        {cooldown && nextAllowedAt && (
          <TypographyMuted>
            {t("dataExport.nextAvailable", { date: formatDateTime(nextAllowedAt) })}
          </TypographyMuted>
        )}
        <ImpersonationReason guard={guard} />
      </CardContent>
    </Card>
  );
}
