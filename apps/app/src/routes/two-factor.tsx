import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TwoFactorPage } from "../features/auth/two-factor.page";

const twoFactorSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/two-factor")({
  validateSearch: twoFactorSearchSchema,
  component: () => {
    const { redirect } = Route.useSearch();

    return <TwoFactorPage redirectTo={redirect} />;
  },
});
