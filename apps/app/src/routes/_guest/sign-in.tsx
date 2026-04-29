import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignInPage } from "../../features/auth/sign-in.page";

const signInSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/_guest/sign-in")({
  validateSearch: signInSearchSchema,
  component: () => {
    const { redirect } = Route.useSearch();

    return <SignInPage redirectTo={redirect} />;
  },
});
