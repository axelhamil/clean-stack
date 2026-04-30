import { createFileRoute } from "@tanstack/react-router";
import { SettingsTeamPage } from "../../../../../features/settings/team.page";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/team")({
  component: SettingsTeamPage,
});
