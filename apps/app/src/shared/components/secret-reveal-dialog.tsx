import { Button } from "@packages/ui/components/ui/button";
import { CopyableValue } from "@packages/ui/components/ui/copyable-value";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface SecretRevealDialogProps {
  secret: string | null;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function SecretRevealDialog({
  secret,
  onClose,
  title,
  description,
}: SecretRevealDialogProps) {
  const { t } = useTranslation("common");
  const resolvedTitle = title ?? t("secretReveal.title");
  const resolvedDescription = description ?? t("secretReveal.description");
  const secretLabel = t("secretReveal.secretLabel");

  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <CopyableValue
          value={secret ?? ""}
          copyLabel={t("clipboard.copyLabel", { label: secretLabel })}
          onCopied={() => toast.success(t("clipboard.copied", { label: secretLabel }))}
        />
        <DialogFooter>
          <Button onClick={onClose}>{t("secretReveal.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
