import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { z } from "zod";

const magicLinkSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/magic-link")({
  validateSearch: magicLinkSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/sign-in" });
  },
  component: lazyRouteComponent(() => import("./magic-link.page"), "MagicLinkPage"),
});
