import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useStaff } from "../../../shared/auth/use-staff";
import {
  revokePlanOverrideMutationOptions,
  setPlanOverrideMutationOptions,
} from "../api/orgs.mutations";
import { planLabelKey } from "../plan-labels";
import { PlanOverrideForm } from "./plan-override-form";

export interface PlanOverrideSectionProps {
  organizationId: string;
  planOverride: { tier: string; expiresAt: string; note: string } | null;
}

export function PlanOverrideSection({ organizationId, planOverride }: PlanOverrideSectionProps) {
  const { t } = useTranslation(["admin", "common"]);
  const formatDateTime = useFormatDateTime();
  const { can } = useStaff();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });

  const setOverride = useMutation({
    ...setPlanOverrideMutationOptions,
    onSuccess: () => {
      setOpen(false);
      toast.success(t("orgs.planOverride.saved"));
      void refresh();
    },
    onError: (err) => toastError(err, errorFallback("setPlanOverride")),
  });
  const revoke = useMutation({
    ...revokePlanOverrideMutationOptions,
    onSuccess: () => {
      toast.success(t("orgs.planOverride.revoked"));
      void refresh();
    },
    onError: (err) => {
      toastError(err, errorFallback("revokePlanOverride"));
      void refresh();
    },
  });
  const tierKey = planOverride && planLabelKey(planOverride.tier);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TypographyH2>{t("orgs.planOverride.title")}</TypographyH2>

      {planOverride ? (
        <DescriptionList layout="inline">
          <DescriptionItem>
            <DescriptionTerm>{t("orgs.planOverride.tierLabel")}</DescriptionTerm>
            <DescriptionDetails>{tierKey ? t(tierKey) : planOverride.tier}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>{t("orgs.planOverride.endLabel")}</DescriptionTerm>
            <DescriptionDetails>{formatDateTime(planOverride.expiresAt)}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem className="gap-4">
            <DescriptionTerm className="shrink-0">
              {t("orgs.planOverride.noteLabel")}
            </DescriptionTerm>
            <DescriptionDetails className="min-w-0 wrap-anywhere">
              {planOverride.note}
            </DescriptionDetails>
          </DescriptionItem>
        </DescriptionList>
      ) : (
        <TypographyMuted>{t("orgs.planOverride.none")}</TypographyMuted>
      )}

      {can("billing.override") && (
        <div className="flex flex-wrap gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                {t(planOverride ? "orgs.planOverride.replace" : "orgs.planOverride.set")}
              </Button>
            </DialogTrigger>
            <DialogContent closeLabel={t("common:actions.close")}>
              <DialogHeader>
                <DialogTitle>{t("orgs.planOverride.dialogTitle")}</DialogTitle>
              </DialogHeader>
              <PlanOverrideForm
                isPending={setOverride.isPending}
                onSubmit={(values) => setOverride.mutate({ id: organizationId, ...values })}
              />
            </DialogContent>
          </Dialog>
          {planOverride && (
            <DestructiveActionDialog
              trigger={
                <Button variant="outline" size="sm">
                  {t("orgs.planOverride.revoke")}
                </Button>
              }
              title={t("orgs.planOverride.revokeTitle")}
              description={t("orgs.planOverride.revokeDescription")}
              actionLabel={t("orgs.planOverride.revoke")}
              cancelLabel={t("common:actions.cancel")}
              isPending={revoke.isPending}
              onConfirm={() => revoke.mutate(organizationId)}
            />
          )}
        </div>
      )}
    </section>
  );
}
