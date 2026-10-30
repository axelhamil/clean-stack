import { Button } from "@packages/ui/components/ui/button";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GuardHint } from "../../../shared/auth/guard-hint";
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

  return (
    <SettingsSection title={t("dataExport.title")} description={t("dataExport.description")}>
      <GuardHint guard={guard} otherwiseDisabled={otherwiseDisabled} className="self-start">
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={otherwiseDisabled || guard.blocked}
          {...guard.describeProps(otherwiseDisabled)}
          onClick={() => mutation.mutate()}
        >
          <DownloadIcon />
          {mutation.isPending ? t("dataExport.requesting") : t("dataExport.request")}
        </Button>
      </GuardHint>
      {cooldown && nextAllowedAt && (
        <TypographyMuted>
          {t("dataExport.nextAvailable", { date: formatDateTime(nextAllowedAt) })}
        </TypographyMuted>
      )}
      <ImpersonationReason guard={guard} />
    </SettingsSection>
  );
}
