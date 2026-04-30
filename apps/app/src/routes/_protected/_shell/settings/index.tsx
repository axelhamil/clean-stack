import { authorizeRole, type OrgRole } from "@packages/access-control";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { activeOrgQueryOptions } from "../../../../adapters/queries/active-org";
import { currentMembershipQueryOptions } from "../../../../adapters/queries/current-membership";

export const Route = createFileRoute("/_protected/_shell/settings/")({
  beforeLoad: async ({ context }) => {
    const org = await context.queryClient.ensureQueryData(activeOrgQueryOptions);
    if (!org) throw redirect({ to: "/settings/account" });

    const membership = await context.queryClient.ensureQueryData(currentMembershipQueryOptions);
    const role = membership?.role as OrgRole | undefined;
    if (authorizeRole(role, { organization: ["update"] })) {
      throw redirect({ to: "/settings/general" });
    }
    throw redirect({ to: "/settings/team" });
  },
});
