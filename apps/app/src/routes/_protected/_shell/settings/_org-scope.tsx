import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { activeOrgQueryOptions } from "../../../../adapters/queries/active-org";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope")({
  beforeLoad: async ({ context }) => {
    const org = await context.queryClient.ensureQueryData(activeOrgQueryOptions);
    if (!org) throw redirect({ to: "/" });
  },
  component: Outlet,
});
