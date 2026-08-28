import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";

const twoFactorSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/two-factor")({
  validateSearch: twoFactorSearchSchema,
  component: lazyRouteComponent(() => import("./two-factor.page"), "TwoFactorPage"),
});
