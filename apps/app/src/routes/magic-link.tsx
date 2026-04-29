import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { MagicLinkPage } from "../features/auth/magic-link.page";

const magicLinkSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/magic-link")({
  validateSearch: magicLinkSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/sign-in" });
  },
  component: () => {
    const { token } = Route.useSearch();
    if (!token) return null;

    return <MagicLinkPage token={token} />;
  },
});
