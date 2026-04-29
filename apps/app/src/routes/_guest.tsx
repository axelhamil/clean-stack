import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../adapters/queries/session";

export const Route = createFileRoute("/_guest")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);

    if (session) throw redirect({ to: "/dashboard" });
  },
  component: () => <Outlet />,
});
