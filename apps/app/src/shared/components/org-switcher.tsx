import { Avatar, AvatarFallback } from "@packages/ui/components/ui/avatar";
import { Button } from "@packages/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@packages/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@packages/ui/components/ui/popover";
import { TypographySmall } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { initialsOf } from "../../shared/utils";
import { activeOrgQueryOptions } from "../api/queries/active-org";
import { orgsListQueryOptions } from "../api/queries/orgs-list";
import { useSetActiveOrg } from "../auth/use-set-active-org";

export function OrgSwitcher() {
  const navigate = useNavigate();
  const { data: orgs = [] } = useQuery(orgsListQueryOptions);
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const { switchOrg, isPending } = useSetActiveOrg();
  const [open, setOpen] = useState(false);

  const handleSwitch = async (organizationId: string) => {
    setOpen(false);
    if (organizationId === activeOrg?.id) return;
    await switchOrg(organizationId);

    void navigate({ to: "/dashboard" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 px-2">
          <Avatar className="size-6 rounded-md">
            <AvatarFallback className="rounded-md text-[10px] font-medium">
              {activeOrg ? initialsOf(activeOrg.name) : "—"}
            </AvatarFallback>
          </Avatar>
          <TypographySmall className="max-w-32 truncate">
            {activeOrg?.name ?? "Select organization"}
          </TypographySmall>
          <ChevronsUpDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search organization..." />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup heading="Organizations">
              {orgs.map((org) => (
                <CommandItem
                  key={org.id}
                  value={`${org.name} ${org.slug}`}
                  onSelect={() => void handleSwitch(org.id)}
                  disabled={isPending}
                >
                  <Avatar className="size-5 rounded">
                    <AvatarFallback className="rounded text-[9px]">
                      {initialsOf(org.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{org.name}</span>
                  {org.id === activeOrg?.id && <Check className="size-4 opacity-60" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem asChild>
                <Link to="/org/new" onClick={() => setOpen(false)}>
                  <Plus />
                  New organization
                </Link>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
