import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { updateOrgPreferenceMutationOptions } from "../../../shared/api/mutations/notifications";
import { orgNotificationPreferencesQueryOptions } from "../../../shared/api/queries/notifications";
import { Can } from "../../../shared/auth/can";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { buildPreferenceMatrix } from "../../../shared/notifications/build-preference-matrix";
import {
  type PreferenceChange,
  PreferenceMatrix,
} from "../../../shared/notifications/preference-matrix";

export function OrgNotificationDefaultsCard() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const guard = useImpersonationGuard();
  const { data, isPending } = useQuery(orgNotificationPreferencesQueryOptions);
  const rows = useMemo(() => buildPreferenceMatrix(data?.items ?? []), [data]);

  const update = useMutation({
    ...updateOrgPreferenceMutationOptions,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orgNotificationPreferencesQueryOptions.queryKey }),
    onError: () => toast.error(t("organization.saveDefaultsFailed")),
  });

  const handleChange = (change: PreferenceChange) => update.mutate(change);

  return (
    <Can requires={{ organization: ["update"] }}>
      <Card>
        <CardHeader>
          <CardTitle>{t("organization.notificationDefaultsTitle")}</CardTitle>
          <CardDescription>{t("organization.notificationDefaultsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferenceMatrix
            rows={rows}
            onChange={handleChange}
            showLock
            disabled={isPending}
            guard={guard}
          />
        </CardContent>
      </Card>
      <ImpersonationReason guard={guard} />
    </Can>
  );
}
