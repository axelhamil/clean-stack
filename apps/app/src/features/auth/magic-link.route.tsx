import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { rootRoute } from "../../router/layouts";

const magicLinkSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const magicLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "magic-link",
  validateSearch: magicLinkSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/sign-in" });
  },
  component: lazyRouteComponent(() => import("./magic-link.page"), "MagicLinkPage"),
});
