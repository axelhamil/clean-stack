import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "../../adapters/components/app-shell";

export const Route = createFileRoute("/_protected/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
