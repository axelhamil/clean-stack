import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, Outlet, redirect } from "@tanstack/react-router";
import { activeOrgQueryOptions } from "../shared/api/queries/active-org";
import { policiesQueryOptions } from "../shared/api/queries/policies";
import { sessionQueryOptions } from "../shared/api/queries/session";
import { ensurePlatformAdmin } from "../shared/auth/ensure-platform-admin";
import { AppShell } from "../shared/components/app-shell";
import { shouldRedirectToLegalAccept } from "./should-redirect-to-legal-accept";

export type RouterContext = { queryClient: QueryClient };

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    throw redirect({ to: session ? "/dashboard" : "/sign-in" });
  },
});

export const guestLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "_guest",
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: () => <Outlet />,
});

export const protectedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "_protected",
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    return { user: session.user, sessionToken: session.session.token };
  },
  component: () => <Outlet />,
});

export const shellLayout = createRoute({
  getParentRoute: () => protectedLayout,
  id: "_shell",
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
  const { user } = shellLayout.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}

export const adminLayout = createRoute({
  getParentRoute: () => shellLayout,
  id: "_admin",
  beforeLoad: ensurePlatformAdmin,
  component: () => <Outlet />,
});

export const settingsLayout = createRoute({
  getParentRoute: () => shellLayout,
  path: "settings",
  component: () => (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Outlet />
    </div>
  ),
});

export const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/",
  beforeLoad: async ({ context }) => {
    const org = await context.queryClient.ensureQueryData(activeOrgQueryOptions);
    throw redirect({ to: org ? "/settings/organization" : "/settings/account" });
  },
});

export const orgScopeLayout = createRoute({
  getParentRoute: () => settingsLayout,
  id: "_org-scope",
  beforeLoad: async ({ context }) => {
    const org = await context.queryClient.ensureQueryData(activeOrgQueryOptions);
    if (!org) throw redirect({ to: "/" });
  },
  component: () => <Outlet />,
});
