import { zodResolver } from "@hookform/resolvers/zod";
import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { formatApiError } from "../api/errors/messages";
import { watchStepUpRefusals } from "../api/errors/step-up-refusal";
import { errorFallback, getErrorsT } from "../i18n/get-errors-t";
import { totpCodeSchema } from "./totp-code.schema";

const stepUpSchema = z.object({ code: totpCodeSchema });

type StepUpValues = z.infer<typeof stepUpSchema>;

export interface StepUpDialogOptions {
  namespace: "admin";
}

export function useStepUpDialog<TData>(
  verifyOptions: UseMutationOptions<TData, Error, StepUpValues, unknown>,
  { namespace }: StepUpDialogOptions,
) {
  const { t } = useTranslation([namespace, "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<StepUpValues>({
    resolver: zodResolver(stepUpSchema),
    defaultValues: { code: "" },
  });
  const mutation = useMutation(verifyOptions);

  useEffect(() => watchStepUpRefusals(queryClient, () => setOpen(true)), [queryClient]);

  const close = () => {
    setOpen(false);
    form.reset();
    mutation.reset();
  };

  const onSubmit = (values: StepUpValues) =>
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

  return {
    open,
    onOpenChange: (next: boolean) => (next ? setOpen(true) : close()),
    form,
    onSubmit,
    isPending: mutation.isPending,
    title: t("stepUp.title"),
    description: t("stepUp.description"),
    codeLabel: t("stepUp.codeLabel"),
    submitLabel: t("stepUp.submit"),
    cancelLabel: t("common:actions.cancel"),
    closeLabel: t("common:actions.close"),
  };
}
