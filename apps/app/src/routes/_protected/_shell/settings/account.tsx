import { createFileRoute } from "@tanstack/react-router";
import { SettingsAccountPage } from "../../../../features/settings/account.page";

export const Route = createFileRoute("/_protected/_shell/settings/account")({
  component: AccountRoute,
});

function AccountRoute() {
  const { user, sessionToken } = Route.useRouteContext();
  return <SettingsAccountPage user={user} sessionToken={sessionToken} />;
}
