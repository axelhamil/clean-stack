import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { Input } from "./input";
import { Label } from "./label";

/**
 * Typing `confirmText` to unlock the action needs a label that names it;
 * the caller writes it in the reader's language, the primitive holds no copy.
 */
type TypedConfirmation =
  | { confirmText: string; confirmTextLabel: ReactNode }
  | { confirmText?: never; confirmTextLabel?: never };

type DestructiveActionDialogProps = TypedConfirmation & {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  actionLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
};

export function DestructiveActionDialog({
  trigger,
  title,
  description,
  actionLabel,
  cancelLabel,
  onConfirm,
  isPending = false,
  confirmText,
  confirmTextLabel,
}: DestructiveActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const requiresTyping = Boolean(confirmText);
  const matched = !requiresTyping || typed === confirmText;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setTyped("");
  };

  const handleConfirm = (e: MouseEvent) => {
    if (!matched) {
      e.preventDefault();
      return;
    }
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requiresTyping && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="destructive-confirm-input">{confirmTextLabel}</Label>
            <Input
              id="destructive-confirm-input"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!matched || isPending}
            onClick={handleConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
