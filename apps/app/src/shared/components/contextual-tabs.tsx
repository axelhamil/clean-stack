import type { OrgPermissions } from "@packages/access-control";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { cn } from "@packages/ui/libs/utils.js";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthorization } from "../auth/use-authorization";

interface TabItem {
  to: string;
  labelKey:
    | "contextualTabs.organization"
    | "contextualTabs.billing"
    | "contextualTabs.webhooks"
    | "contextualTabs.sso"
    | "contextualTabs.account"
    | "contextualTabs.notifications"
    | "contextualTabs.privacy"
    | "contextualTabs.apiTokens";
  icon?: LucideIcon;
  requires?: OrgPermissions;
  requiresOrg?: boolean;
}

const SETTINGS_TABS: readonly TabItem[] = [
  { to: "/settings/organization", labelKey: "contextualTabs.organization", requiresOrg: true },
  {
    to: "/settings/billing",
    labelKey: "contextualTabs.billing",
    requires: { billing: ["manage"] },
    requiresOrg: true,
  },
  {
    to: "/settings/webhooks",
    labelKey: "contextualTabs.webhooks",
    requires: { webhooks: ["read"] },
    requiresOrg: true,
  },
  {
    to: "/settings/sso",
    labelKey: "contextualTabs.sso",
    requires: { organization: ["update"] },
    requiresOrg: true,
  },
  { to: "/settings/account", labelKey: "contextualTabs.account" },
  { to: "/settings/notifications", labelKey: "contextualTabs.notifications" },
  { to: "/settings/privacy", labelKey: "contextualTabs.privacy" },
  { to: "/settings/api-tokens", labelKey: "contextualTabs.apiTokens" },
];

interface ContextualTabsProps {
  className?: string;
}

export function ContextualTabs({ className }: ContextualTabsProps) {
  const { t } = useTranslation("common");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, hasMembership } = useAuthorization();

  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    if (tab.requiresOrg && !hasMembership) return false;
    if (tab.requires) return can(tab.requires);
    return true;
  });

  return (
    <nav
      aria-label={t("contextualTabs.ariaLabel")}
      className={cn("flex items-center gap-1 overflow-x-auto", className)}
    >
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink key={tab.to} variant="underline" active={pathname === tab.to} asChild>
            <Link to={tab.to} className="gap-1.5">
              {Icon && <Icon className="size-3.5" />}
              {t(tab.labelKey)}
            </Link>
          </NavLink>
        );
      })}
    </nav>
  );
}
