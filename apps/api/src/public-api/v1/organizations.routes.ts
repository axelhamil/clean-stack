import { Hono } from "hono";
import type { AuthQueries } from "../../auth/queries";
import type { ApiTokenVariables } from "../../shared/middleware/api-token.middleware";
import { requireScope } from "../require-scope";

export const orgsPublicRoutes = (queries: Pick<AuthQueries, "findUserOrganizations">) =>
  new Hono<{ Variables: ApiTokenVariables }>().get(
    "/",
    requireScope("read:organizations"),
    async (c) => {
      const organizations = await queries.findUserOrganizations(c.get("user").id);
      return c.json({ organizations });
    },
  );
