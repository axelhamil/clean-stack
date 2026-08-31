import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { CopyIcon } from "lucide-react";
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

  const copy = () => {
    if (!secret) return;
    void navigator.clipboard.writeText(secret);
    toast.success(t("clipboard.copied", { label: secretLabel }));
  };
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm break-all">
          <span className="flex-1">{secret}</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={copy}
            aria-label={t("clipboard.copyLabel", { label: secretLabel })}
          >
            <CopyIcon className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("secretReveal.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
