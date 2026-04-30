import type { OrgPermissions } from "@packages/access-control";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { cn } from "@packages/ui/libs/utils.js";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuthorization } from "../hooks/use-authorization";

interface TabItem {
  to: string;
  label: string;
  requires?: OrgPermissions;
  requiresOrg?: boolean;
}

const SETTINGS_TABS: readonly TabItem[] = [
  {
    to: "/settings/general",
    label: "General",
    requires: { organization: ["update"] },
    requiresOrg: true,
  },
  { to: "/settings/team", label: "Team", requiresOrg: true },
  {
    to: "/settings/billing",
    label: "Billing",
    requires: { billing: ["manage"] },
    requiresOrg: true,
  },
  { to: "/settings/account", label: "Account" },
];

interface ContextualTabsProps {
  className?: string;
}

export function ContextualTabs({ className }: ContextualTabsProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, hasMembership } = useAuthorization();

  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    if (tab.requiresOrg && !hasMembership) return false;
    if (tab.requires) return can(tab.requires);
    return true;
  });

  return (
    <nav
      aria-label="Settings sections"
      className={cn("flex items-center gap-1 overflow-x-auto", className)}
    >
      {visibleTabs.map((tab) => (
        <NavLink key={tab.to} variant="underline" active={pathname === tab.to} asChild>
          <Link to={tab.to}>{tab.label}</Link>
        </NavLink>
      ))}
    </nav>
  );
}
