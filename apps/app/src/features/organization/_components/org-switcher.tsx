import { Button } from "@packages/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, Plus } from "lucide-react";
import { broadcastAuthChange } from "../../../adapters/auth-broadcast";
import { setActiveOrgMutationOptions } from "../../../adapters/mutations/set-active-org";
import { activeOrgQueryOptions } from "../../../adapters/queries/active-org";
import { orgsListQueryOptions } from "../../../adapters/queries/orgs-list";
import { sessionQueryOptions } from "../../../adapters/queries/session";

export function OrgSwitcher() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgs = [] } = useQuery(orgsListQueryOptions);
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const setActive = useMutation(setActiveOrgMutationOptions);

  const handleSwitch = async (organizationId: string) => {
    await setActive.mutateAsync({ organizationId });
    await Promise.all([
      queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey }),
      queryClient.refetchQueries({ queryKey: activeOrgQueryOptions.queryKey }),
    ]);
    broadcastAuthChange();
    void navigate({ to: "/dashboard" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-56 justify-between">
          <span className="truncate">{activeOrg?.name ?? "Select organization"}</span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => void handleSwitch(org.id)}
            disabled={setActive.isPending || org.id === activeOrg?.id}
          >
            {org.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* TODO(Task 15): replace "." with "/org/new" once that route exists */}
        <DropdownMenuItem asChild>
          <Link to="." className="flex items-center gap-2">
            <Plus className="size-4" /> New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
