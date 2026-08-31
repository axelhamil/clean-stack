import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { updatePreferenceMutationOptions } from "../../shared/api/mutations/notifications";
import { notificationPreferencesQueryOptions } from "../../shared/api/queries/notifications";
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
  const { data, isPending } = useQuery(notificationPreferencesQueryOptions);
  const rows = useMemo(() => buildPreferenceMatrix(data?.items ?? []), [data]);

  const update = useMutation({
    ...updatePreferenceMutationOptions,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationPreferencesQueryOptions.queryKey }),
    onError: () => toast.error(t("notifications.saveFailedToast")),
  });

  const handleChange = ({ category, channel, enabled, frequency }: PreferenceChange) =>
    update.mutate({ category, channel, enabled, frequency });

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">{t("notifications.title")}</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>{t("notifications.preferencesTitle")}</CardTitle>
          <CardDescription>{t("notifications.preferencesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferenceMatrix rows={rows} onChange={handleChange} disabled={isPending} />
        </CardContent>
      </Card>
    </main>
  );
}
