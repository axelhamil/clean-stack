import { BackupCodeList } from "@packages/ui/components/ui/backup-code-list";
import { Button } from "@packages/ui/components/ui/button";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { captureError } from "../../../shared/observability/sentry";

const DOWNLOAD_FILENAME = "clean-stack-recovery-codes.txt";

/**
 * The confirmation waits for the clipboard write: a denied permission must not
 * tell the user their only recovery codes were copied. The caller reports a
 * rejection and tells the user to download the codes instead.
 */
export async function copyRecoveryCodes(
  codes: readonly string[],
  onCopied: () => void,
): Promise<void> {
  await navigator.clipboard.writeText(codes.join("\n"));
  onCopied();
}

interface BackupCodesPanelProps {
  codes: readonly string[];
}

export function BackupCodesPanel({ codes }: BackupCodesPanelProps) {
  const { t } = useTranslation("settings");

  const copyCodes = () => {
    copyRecoveryCodes(codes, () => toast.success(t("backupCodes.copiedToast"))).catch(
      (err: unknown) => {
        captureError(err, { context: "backupCodes.copy" });
        toast.error(t("backupCodes.copyFailed"));
      },
    );
  };

  const downloadCodes = () => {
    const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = DOWNLOAD_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <TypographySmall>{t("backupCodes.title")}</TypographySmall>
        <TypographyMuted>{t("backupCodes.description")}</TypographyMuted>
      </div>
      <BackupCodeList codes={codes} />
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={copyCodes}>
          <CopyIcon />
          {t("backupCodes.copy")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={downloadCodes}>
          <DownloadIcon />
          {t("backupCodes.download")}
        </Button>
      </div>
    </div>
  );
}
