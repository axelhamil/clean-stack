import { staffReachable } from "@packages/access-control";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Settings, ShieldCheck } from "lucide-react";
import { sessionQueryOptions } from "../api/queries/session";
import { staffOf } from "../auth/staff-access";

const PRIMARY_NAV = [
  {
    to: "/dashboard",
    section: "/dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    staffOnly: false,
  },
  {
    to: "/settings",
    section: "/settings",
    labelKey: "nav.settings",
    icon: Settings,
    staffOnly: false,
  },
  {
    to: "/admin/users",
    section: "/admin",
    labelKey: "nav.admin",
    icon: ShieldCheck,
    staffOnly: true,
  },
] as const;

export function usePrimaryNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useQuery(sessionQueryOptions);
  const reachable = staffReachable(staffOf(session));

  return PRIMARY_NAV.filter((entry) => reachable || !entry.staffOnly).map((entry) => ({
    ...entry,
    active: pathname === entry.section || pathname.startsWith(`${entry.section}/`),
  }));
}
