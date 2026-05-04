import { authorizeRole, type OrgRole } from "@packages/access-control";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, Outlet, redirect } from "@tanstack/react-router";
import { activeOrgQueryOptions } from "../shared/api/queries/active-org";
import { currentMembershipQueryOptions } from "../shared/api/queries/current-membership";
import { sessionQueryOptions } from "../shared/api/queries/session";
import { AppShell } from "../shared/components/app-shell";

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
    if (!org) throw redirect({ to: "/settings/account" });

    const membership = await context.queryClient.ensureQueryData(currentMembershipQueryOptions);
    const role = membership?.role as OrgRole | undefined;
    throw redirect({
      to: authorizeRole(role, { organization: ["update"] })
        ? "/settings/general"
        : "/settings/team",
    });
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
