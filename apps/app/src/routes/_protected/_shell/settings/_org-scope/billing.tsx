import { createFileRoute } from "@tanstack/react-router";
import { ensureOrgPermission } from "../../../../../adapters/route-helpers/ensure-org-permission";
import { SettingsBillingPage } from "../../../../../features/settings/billing.page";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/billing")({
  beforeLoad: ensureOrgPermission({ billing: ["manage"] }),
  component: SettingsBillingPage,
});
