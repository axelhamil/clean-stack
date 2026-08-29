import { createFileRoute, redirect } from "@tanstack/react-router";
import { activeOrgQueryOptions } from "../shared/api/queries/active-org";

export const Route = createFileRoute("/_protected/_shell/settings/")({
  beforeLoad: async ({ context }) => {
    const org = await context.queryClient.ensureQueryData(activeOrgQueryOptions);
    throw redirect({ to: org ? "/settings/organization" : "/settings/account" });
  },
});
