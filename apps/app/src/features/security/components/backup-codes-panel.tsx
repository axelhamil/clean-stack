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
import { toast } from "sonner";

const DOWNLOAD_FILENAME = "clean-stack-recovery-codes.txt";

interface BackupCodesPanelProps {
  codes: readonly string[];
}

export function BackupCodesPanel({ codes }: BackupCodesPanelProps) {
  const copyCodes = () => {
    void navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Backup codes copied");
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
        <CardTitle>Backup codes</CardTitle>
        <CardDescription>
          Save these in a safe place. Each can be used once if you lose your device.
        </CardDescription>
        <CardAction className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={copyCodes}>
            <CopyIcon />
            Copy
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={downloadCodes}>
            <DownloadIcon />
            Download
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <BackupCodeList codes={codes} />
      </CardContent>
    </Card>
  );
}
