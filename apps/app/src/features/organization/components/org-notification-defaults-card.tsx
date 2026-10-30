import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toastError } from "../../../shared/api/errors/toast";
import { updateOrgPreferenceMutationOptions } from "../../../shared/api/mutations/notifications";
import { orgNotificationPreferencesQueryOptions } from "../../../shared/api/queries/notifications";
import { Can } from "../../../shared/auth/can";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useActiveOrgId } from "../../../shared/auth/use-active-org-id";
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
  const organizationId = useActiveOrgId();
  const { data, isPending, isLoadingError } = useQuery(
    orgNotificationPreferencesQueryOptions(organizationId),
  );
  const rows = useMemo(() => buildPreferenceMatrix(data?.items ?? []), [data]);

  const update = useMutation({
    ...updateOrgPreferenceMutationOptions,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orgNotificationPreferencesQueryOptions(organizationId).queryKey,
      }),
    onError: (err) => toastError(err, t("organization.saveDefaultsFailed")),
  });

  const handleChange = (change: PreferenceChange) => update.mutate(change);

  return (
    <Can requires={{ organization: ["update"] }}>
      <SettingsSection
        title={t("organization.notificationDefaultsTitle")}
        description={t("organization.notificationDefaultsDescription")}
      >
        {isLoadingError ? (
          <LoadErrorAlert message={t("notifications.loadFailed")} />
        ) : (
          <PreferenceMatrix
            rows={rows}
            onChange={handleChange}
            showLock
            disabled={isPending}
            guard={guard}
          />
        )}
      </SettingsSection>
      <ImpersonationReason guard={guard} />
    </Can>
  );
}
