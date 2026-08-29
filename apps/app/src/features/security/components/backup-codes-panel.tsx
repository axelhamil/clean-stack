import { BackupCodeList } from "@packages/ui/components/ui/backup-code-list";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const DOWNLOAD_FILENAME = "clean-stack-recovery-codes.txt";

interface BackupCodesPanelProps {
  codes: readonly string[];
}

export function BackupCodesPanel({ codes }: BackupCodesPanelProps) {
  const { t } = useTranslation("settings");

  const copyCodes = () => {
    void navigator.clipboard.writeText(codes.join("\n"));
    toast.success(t("backupCodes.copiedToast"));
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
    <Card>
      <CardHeader>
        <CardTitle>{t("backupCodes.title")}</CardTitle>
        <CardDescription>{t("backupCodes.description")}</CardDescription>
        <CardAction className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={copyCodes}>
            <CopyIcon />
            {t("backupCodes.copy")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={downloadCodes}>
            <DownloadIcon />
            {t("backupCodes.download")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <BackupCodeList codes={codes} />
      </CardContent>
    </Card>
  );
}
