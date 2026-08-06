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
  title = "Signing secret",
  description = "Copy this now — it is shown only once and cannot be retrieved later.",
}: SecretRevealDialogProps) {
  const copy = () => {
    if (!secret) return;
    void navigator.clipboard.writeText(secret);
    toast.success("Secret copied to clipboard");
  };
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm break-all">
          <span className="flex-1">{secret}</span>
          <Button size="icon" variant="ghost" onClick={copy} aria-label="Copy secret">
            <CopyIcon className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
