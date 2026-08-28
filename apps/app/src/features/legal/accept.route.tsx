import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/_protected/legal/accept")({
  validateSearch: searchSchema,
  component: lazyRouteComponent(() => import("./accept.page"), "AcceptPoliciesPage"),
});
