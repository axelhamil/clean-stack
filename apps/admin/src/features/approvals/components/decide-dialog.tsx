import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import { Textarea } from "@packages/ui/components/ui/textarea";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { decideApprovalMutationOptions, refreshAfterDecision } from "../api/approvals.mutations";

const decideSchema = z.object({ note: z.string().trim().min(1).max(500) });

type DecideValues = z.infer<typeof decideSchema>;

export interface DecideDialogProps {
  approvalId: string;
  decision: "approve" | "reject";
}

export function DecideDialog({ approvalId, decision }: DecideDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<DecideValues>({
    resolver: zodResolver(decideSchema),
    defaultValues: { note: "" },
  });
  const decide = useMutation({
    ...decideApprovalMutationOptions,
    onSuccess: () => {
      setOpen(false);
      form.reset();
      toast.success(t(`approvals.detail.${decision}Done`));
      refreshAfterDecision(queryClient);
    },
    onError: (err) => {
      toastError(err, errorFallback("decideApproval"));
      refreshAfterDecision(queryClient);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={decision === "approve" ? "default" : "outline"}>
          {t(`approvals.detail.${decision}`)}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common:actions.close")}>
        <DialogHeader>
          <DialogTitle>{t(`approvals.detail.${decision}Title`)}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) =>
              decide.mutate({ id: approvalId, decision, note: values.note }),
            )}
          >
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("approvals.detail.noteLabel")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="self-end"
              variant={decision === "approve" ? "default" : "destructive"}
              disabled={decide.isPending}
            >
              {t(`approvals.detail.${decision}`)}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
