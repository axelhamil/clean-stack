import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { policiesQueryOptions } from "../shared/api/queries/policies";
import { sessionQueryOptions } from "../shared/api/queries/session";
import { AppShell } from "../shared/components/app-shell";
import { shouldRedirectToLegalAccept } from "./should-redirect-to-legal-accept";

export const Route = createFileRoute("/_protected/_shell")({
  beforeLoad: async ({ context, location }) => {
    const [policies, session] = await Promise.all([
      context.queryClient.ensureQueryData(policiesQueryOptions).catch(() => null),
      context.queryClient.ensureQueryData(sessionQueryOptions).catch(() => null),
    ]);
    if (shouldRedirectToLegalAccept(session, policies)) {
      throw redirect({ to: "/legal/accept", search: { redirect: location.href } });
    }
  },
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
