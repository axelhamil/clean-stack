import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "../../features/account/security.page";

export const Route = createFileRoute("/_protected/account/security")({
  component: SecurityRoute,
});

function SecurityRoute() {
  const { user, sessionToken } = Route.useRouteContext();

  return <SecurityPage user={user} sessionToken={sessionToken} />;
}
