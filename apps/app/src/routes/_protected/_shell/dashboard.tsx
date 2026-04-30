import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../../../features/dashboard/dashboard.page";

export const Route = createFileRoute("/_protected/_shell/dashboard")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { user } = Route.useRouteContext();

  return <DashboardPage user={user} />;
}
