import { useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Settings } from "lucide-react";

const PRIMARY_NAV = [
  {
    to: "/dashboard",
    section: "/dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
  },
  {
    to: "/settings",
    section: "/settings",
    labelKey: "nav.settings",
    icon: Settings,
  },
] as const;

export function usePrimaryNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return PRIMARY_NAV.map((entry) => ({
    ...entry,
    active: pathname === entry.section || pathname.startsWith(`${entry.section}/`),
  }));
}
