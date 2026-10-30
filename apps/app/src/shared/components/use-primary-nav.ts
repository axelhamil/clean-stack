import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Settings, ShieldCheck } from "lucide-react";
import { sessionQueryOptions } from "../api/queries/session";
import { canAccessPlatformAdmin } from "../auth/can-access-platform-admin";

const PRIMARY_NAV = [
  {
    to: "/dashboard",
    section: "/dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    platformAdminOnly: false,
  },
  {
    to: "/settings",
    section: "/settings",
    labelKey: "nav.settings",
    icon: Settings,
    platformAdminOnly: false,
  },
  {
    to: "/admin/users",
    section: "/admin",
    labelKey: "nav.admin",
    icon: ShieldCheck,
    platformAdminOnly: true,
  },
] as const;

export function usePrimaryNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useQuery(sessionQueryOptions);
  const platformAdmin = canAccessPlatformAdmin(session);

  return PRIMARY_NAV.filter((entry) => platformAdmin || !entry.platformAdminOnly).map((entry) => ({
    ...entry,
    active: pathname === entry.section || pathname.startsWith(`${entry.section}/`),
  }));
}
