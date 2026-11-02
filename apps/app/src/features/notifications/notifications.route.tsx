import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { updatePreferenceMutationOptions } from "../../shared/api/mutations/notifications";
import { notificationPreferencesQueryOptions } from "../../shared/api/queries/notifications";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { buildPreferenceMatrix } from "../../shared/notifications/build-preference-matrix";
import {
  type PreferenceChange,
  PreferenceMatrix,
} from "../../shared/notifications/preference-matrix";

export const Route = createFileRoute("/_protected/_shell/settings/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const guard = useImpersonationGuard();
  const { data, isPending, isLoadingError } = useQuery(notificationPreferencesQueryOptions);
  const rows = useMemo(() => buildPreferenceMatrix(data?.items ?? []), [data]);

  const update = useMutation({
    ...updatePreferenceMutationOptions,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationPreferencesQueryOptions.queryKey }),
    onError: (err) => toastError(err, t("notifications.saveFailedToast")),
  });

  const handleChange = ({ category, channel, enabled, frequency }: PreferenceChange) =>
    update.mutate({ category, channel, enabled, frequency });

  return (
    <main className="flex flex-col gap-8">
      <TypographyH1 className="sr-only">{t("notifications.title")}</TypographyH1>
      <SettingsSection
        title={t("notifications.preferencesTitle")}
        description={t("notifications.preferencesDescription")}
      >
        {isLoadingError ? (
          <LoadErrorAlert message={t("notifications.loadFailed")} />
        ) : (
          <PreferenceMatrix
            rows={rows}
            onChange={handleChange}
            disabled={isPending}
            guard={guard}
          />
        )}
      </SettingsSection>
      <ImpersonationReason guard={guard} />
    </main>
  );
}
