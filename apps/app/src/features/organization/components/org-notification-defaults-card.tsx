import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { updateOrgPreferenceMutationOptions } from "../../../shared/api/mutations/notifications";
import { orgNotificationPreferencesQueryOptions } from "../../../shared/api/queries/notifications";
import { Can } from "../../../shared/auth/can";
import { buildPreferenceMatrix } from "../../../shared/notifications/build-preference-matrix";
import {
  type PreferenceChange,
  PreferenceMatrix,
} from "../../../shared/notifications/preference-matrix";

export function OrgNotificationDefaultsCard() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(orgNotificationPreferencesQueryOptions);
  const rows = useMemo(() => buildPreferenceMatrix(data?.items ?? []), [data]);

  const update = useMutation({
    ...updateOrgPreferenceMutationOptions,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orgNotificationPreferencesQueryOptions.queryKey }),
    onError: () => toast.error("Could not save the organization defaults"),
  });

  const handleChange = (change: PreferenceChange) => update.mutate(change);

  return (
    <Can requires={{ organization: ["update"] }}>
      <Card>
        <CardHeader>
          <CardTitle>Notification defaults</CardTitle>
          <CardDescription>
            Members who have not chosen for themselves inherit these settings. Enforce a category to
            impose it on everyone, overriding their own choice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferenceMatrix rows={rows} onChange={handleChange} showLock disabled={isPending} />
        </CardContent>
      </Card>
    </Can>
  );
}
