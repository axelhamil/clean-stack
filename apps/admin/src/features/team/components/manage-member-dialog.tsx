import type { StaffRole } from "@packages/access-control";
import { isStaffPermission } from "@packages/access-control";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Separator } from "@packages/ui/components/ui/separator";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openApprovalIdOf } from "../../../shared/api/approval-outcome";
import {
  removeStaffOverrideMutationOptions,
  revokeStaffMutationOptions,
  setStaffOverrideMutationOptions,
  setStaffRoleMutationOptions,
} from "../api/team.mutations";
import { staffOverridesQueryOptions } from "../api/team.queries";
import { STAFF_PERMISSION_LABEL_KEYS } from "../team-labels";
import { OverrideForm } from "./override-form";
import { RoleSelect } from "./role-select";

export interface ManageMemberDialogProps {
  member: { userId: string; email: string; name: string; role: StaffRole };
  onAwaiting: (approvalId: string) => void;
}

export function ManageMemberDialog({ member, onAwaiting }: ManageMemberDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("team.manage")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common:actions.close")} className="max-h-dvh overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="wrap-anywhere">
            {t("team.manageTitle", { name: member.name || member.email })}
          </DialogTitle>
          <DialogDescription className="wrap-anywhere">{member.email}</DialogDescription>
        </DialogHeader>
        <ManageMemberBody
          member={member}
          onAwaiting={(approvalId) => {
            setOpen(false);
            onAwaiting(approvalId);
          }}
          onRevoked={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ManageMemberBodyProps extends ManageMemberDialogProps {
  onRevoked: () => void;
}

function ManageMemberBody({ member, onAwaiting, onRevoked }: ManageMemberBodyProps) {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const queryClient = useQueryClient();
  const id = member.userId;
  const [role, setRole] = useState<StaffRole>(member.role);
  const overrides = useQuery(staffOverridesQueryOptions(id));

  const settled = (approvalId: string | null, doneMessage: string) => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    if (approvalId) {
      toast.success(t("backOffice.awaiting.toast"));
      onAwaiting(approvalId);
      return;
    }

    toast.success(doneMessage);
  };

  const setRoleMutation = useMutation({
    ...setStaffRoleMutationOptions,
    onSuccess: (approvalId) => settled(approvalId, t("team.roleSaved")),
    onError: (err) => {
      toastError(err, errorFallback("setStaffRole"));
      const openId = openApprovalIdOf(err);
      if (openId) onAwaiting(openId);
    },
  });
  const revoke = useMutation({
    ...revokeStaffMutationOptions,
    onSuccess: (approvalId) => {
      settled(approvalId, t("team.revoked"));
      if (!approvalId) onRevoked();
    },
    onError: (err) => {
      toastError(err, errorFallback("revokeStaff"));
      const openId = openApprovalIdOf(err);
      if (openId) onAwaiting(openId);
    },
  });
  const setOverride = useMutation({
    ...setStaffOverrideMutationOptions,
    onSuccess: (approvalId) => settled(approvalId, t("team.permissions.added")),
    onError: (err) => {
      toastError(err, errorFallback("setStaffOverride"));
      const openId = openApprovalIdOf(err);
      if (openId) onAwaiting(openId);
    },
  });
  const removeOverride = useMutation({
    ...removeStaffOverrideMutationOptions,
    onSuccess: (approvalId) => settled(approvalId, t("team.permissions.removed")),
    onError: (err) => {
      toastError(err, errorFallback("removeStaffOverride"));
      const openId = openApprovalIdOf(err);
      if (openId) onAwaiting(openId);
    },
  });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <TypographyH2>{t("team.table.role")}</TypographyH2>
        <div className="flex flex-wrap gap-2">
          <RoleSelect value={role} onChange={setRole} label={t("team.table.role")} />
          <Button
            variant="outline"
            disabled={role === member.role || setRoleMutation.isPending}
            onClick={() => setRoleMutation.mutate({ id, role })}
          >
            {t("team.saveRole")}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <TypographyH2>{t("team.permissions.title")}</TypographyH2>
        {overrides.isPending && <SkeletonTable label={t("team.loading")} columns={2} rows={2} />}
        {overrides.isError && <LoadErrorAlert message={t("team.permissions.loadFailed")} />}
        {overrides.isSuccess && overrides.data.items.length === 0 && (
          <TypographyMuted>{t("team.permissions.empty")}</TypographyMuted>
        )}
        {overrides.isSuccess && overrides.data.items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {overrides.data.items.map((override) => {
              const name = isStaffPermission(override.permission)
                ? t(STAFF_PERMISSION_LABEL_KEYS[override.permission])
                : override.permission;

              return (
                <ListRow key={override.id}>
                  <ListRowContent className="min-w-0 wrap-anywhere">
                    {name}
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={override.effect === "deny" ? "destructive" : "secondary"}>
                        {t(`team.permissions.effect.${override.effect}`)}
                      </Badge>
                      <TypographyMuted>
                        {override.expiresAt
                          ? t("team.permissions.until", { date: formatDate(override.expiresAt) })
                          : t("team.permissions.noEnd")}
                      </TypographyMuted>
                    </span>
                  </ListRowContent>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    aria-label={t("team.permissions.remove", { permission: name })}
                    disabled={removeOverride.isPending}
                    onClick={() => removeOverride.mutate({ id, overrideId: override.id })}
                  >
                    {t("team.permissions.removeShort")}
                  </Button>
                </ListRow>
              );
            })}
          </ul>
        )}
        <OverrideForm
          isPending={setOverride.isPending}
          onSubmit={(values) => setOverride.mutate({ id, ...values })}
        />
      </div>

      <Separator />

      <DestructiveActionDialog
        trigger={
          <Button variant="destructive" className="self-start" disabled={revoke.isPending}>
            {t("team.revoke")}
          </Button>
        }
        title={t("team.revokeTitle")}
        description={t("team.revokeDescription", { email: member.email })}
        actionLabel={t("team.revoke")}
        cancelLabel={t("common:actions.cancel")}
        isPending={revoke.isPending}
        onConfirm={() => revoke.mutate(id)}
      />
    </div>
  );
}
