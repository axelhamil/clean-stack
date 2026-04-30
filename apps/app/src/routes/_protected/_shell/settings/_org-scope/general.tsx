import { createFileRoute } from "@tanstack/react-router";
import { ensureOrgPermission } from "../../../../../adapters/route-helpers/ensure-org-permission";
import { SettingsGeneralPage } from "../../../../../features/settings/general.page";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/general")({
  beforeLoad: ensureOrgPermission({ organization: ["update"] }),
  component: SettingsGeneralPage,
});
