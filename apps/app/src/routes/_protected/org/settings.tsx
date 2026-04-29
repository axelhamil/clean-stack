import { createFileRoute } from "@tanstack/react-router";
import { OrgSettingsPage } from "../../../features/organization/settings.page";

export const Route = createFileRoute("/_protected/org/settings")({
  component: OrgSettingsPage,
});
