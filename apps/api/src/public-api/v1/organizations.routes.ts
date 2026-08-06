import { Hono } from "hono";
import { findUserOrganizations } from "../../auth-queries";
import type { ApiTokenVariables } from "../../shared/middleware/api-token.middleware";
import { requireScope } from "../require-scope";

export const orgsPublicRoutes = new Hono<{ Variables: ApiTokenVariables }>().get(
  "/",
  requireScope("read:organizations"),
  async (c) => {
    const organizations = await findUserOrganizations(c.get("user").id);
    return c.json({ organizations });
  },
);
