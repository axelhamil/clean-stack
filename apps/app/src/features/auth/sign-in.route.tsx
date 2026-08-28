import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";

const signInSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/_guest/sign-in")({
  validateSearch: signInSearchSchema,
  component: lazyRouteComponent(() => import("./sign-in.page"), "SignInPage"),
});
