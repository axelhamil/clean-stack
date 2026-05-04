import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setActiveOrgMutationOptions } from "../api/mutations/set-active-org";
import { activeOrgQueryOptions } from "../api/queries/active-org";
import { orgsListQueryOptions } from "../api/queries/orgs-list";
import { sessionQueryOptions } from "../api/queries/session";
import { broadcastAuthChange } from "./auth-broadcast";

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
