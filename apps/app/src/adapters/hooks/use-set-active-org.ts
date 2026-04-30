import { useMutation, useQueryClient } from "@tanstack/react-query";
import { broadcastAuthChange } from "../auth-broadcast";
import { setActiveOrgMutationOptions } from "../mutations/set-active-org";
import { activeOrgQueryOptions } from "../queries/active-org";
import { orgsListQueryOptions } from "../queries/orgs-list";
import { sessionQueryOptions } from "../queries/session";

export function useSetActiveOrg() {
  const queryClient = useQueryClient();
  const setActive = useMutation(setActiveOrgMutationOptions);

  const switchOrg = async (organizationId: string) => {
    await setActive.mutateAsync({ organizationId });
    await Promise.all([
      queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey }),
      queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
      queryClient.refetchQueries({ queryKey: orgsListQueryOptions.queryKey }),
    ]);
    broadcastAuthChange();
  };

  return { switchOrg, isPending: setActive.isPending };
}
