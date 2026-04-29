import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../adapters/queries/session";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session =
      await context.queryClient.ensureQueryData(sessionQueryOptions);

    throw redirect({ to: session ? "/dashboard" : "/sign-in" });
  },
});
