import { Button } from "@packages/ui/components/ui/button";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface CopyRowProps {
  label: string;
  value: string;
}

export function CopyRow({ label, value }: CopyRowProps) {
  const { t } = useTranslation("common");
  const copy = () => {
    void navigator.clipboard.writeText(value);
    toast.success(t("clipboard.copied", { label }));
  };

  return (
    <div className="flex flex-col gap-1">
      <TypographyMuted>{label}</TypographyMuted>
      <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm break-all">
        <span className="flex-1">{value}</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={copy}
          aria-label={t("clipboard.copyLabel", { label })}
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
