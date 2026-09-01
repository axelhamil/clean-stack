import { CopyableValue } from "@packages/ui/components/ui/copyable-value";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface CopyRowProps {
  label: string;
  value: string;
}

export function CopyRow({ label, value }: CopyRowProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col gap-1">
      <TypographyMuted>{label}</TypographyMuted>
      <CopyableValue
        value={value}
        copyLabel={t("clipboard.copyLabel", { label })}
        onCopied={() => toast.success(t("clipboard.copied", { label }))}
      />
    </div>
  );
}
