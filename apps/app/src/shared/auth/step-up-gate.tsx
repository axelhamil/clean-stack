import { zodResolver } from "@hookform/resolvers/zod";
import { StepUpDialog, type StepUpFormValues } from "@packages/ui/components/ui/step-up-dialog";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { watchStepUpRefusals } from "@packages/web-kit/api/errors/step-up-refusal";
import { errorFallback, getErrorsT } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { verifyStepUpMutationOptions } from "../api/mutations/verify-step-up";
import { totpCodeSchema } from "./auth.schema";

const stepUpSchema = z.object({ code: totpCodeSchema });

export function StepUpGate() {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<StepUpFormValues>({
    resolver: zodResolver(stepUpSchema),
    defaultValues: { code: "" },
  });

  useEffect(() => watchStepUpRefusals(queryClient, () => setOpen(true)), [queryClient]);

  const mutation = useMutation(verifyStepUpMutationOptions);

  const close = () => {
    setOpen(false);
    form.reset();
    mutation.reset();
  };

  const submit = (values: StepUpFormValues) =>
    mutation.mutate(values, {
      onSuccess: () => {
        close();
        toast.success(t("stepUp.confirmedToast"));
      },
      onError: (err) =>
        form.setError("code", {
          message: formatApiError(err, errorFallback("verifyStepUp"), getErrorsT()),
        }),
    });

  return (
    <StepUpDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      form={form}
      onSubmit={submit}
      isPending={mutation.isPending}
      title={t("stepUp.title")}
      description={t("stepUp.description")}
      codeLabel={t("stepUp.codeLabel")}
      submitLabel={t("stepUp.submit")}
      cancelLabel={t("common:actions.cancel")}
      closeLabel={t("common:actions.close")}
    />
  );
}
