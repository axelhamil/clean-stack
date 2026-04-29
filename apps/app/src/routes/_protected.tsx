import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../adapters/queries/session";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ context, location }) => {
    const session =
      await context.queryClient.ensureQueryData(sessionQueryOptions);

    if (!session)
      throw redirect({
        to: "/sign-in",
        search: { redirect: location.href },
      });

    return { user: session.user, sessionToken: session.session.token };
  },
  component: () => <Outlet />,
});
