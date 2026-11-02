import type { UseFormReturn } from "react-hook-form";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Form } from "./form";
import { FormTextField } from "./form-text-field";

export interface StepUpFormValues {
  code: string;
}

export interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<StepUpFormValues>;
  onSubmit: (values: StepUpFormValues) => void;
  isPending: boolean;
  title: string;
  description: string;
  codeLabel: string;
  submitLabel: string;
  cancelLabel: string;
  closeLabel: string;
}

function returnFocusToDialogBelow(event: Event): void {
  const below = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  if (!below) return;

  event.preventDefault();
  below.focus();
}

export function StepUpDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  isPending,
  title,
  description,
  codeLabel,
  submitLabel,
  cancelLabel,
  closeLabel,
}: StepUpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={closeLabel} onCloseAutoFocus={returnFocusToDialogBelow}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormTextField
              control={form.control}
              name="code"
              label={codeLabel}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
