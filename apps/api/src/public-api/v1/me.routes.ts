import { Hono } from "hono";
import { z } from "zod";
import { updateUserName } from "../../auth-queries";
import type { ApiTokenVariables } from "../../shared/middleware/api-token.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
import { zV } from "../../shared/validator";
import { requireScope } from "../require-scope";
import { meResponseSchema } from "./schemas";

const patchMeSchema = z.object({ name: z.string().min(1).max(100) });

export const mePublicRoutes = new Hono<{ Variables: ApiTokenVariables }>()
  .get("/", requireScope("read:profile"), (c) =>
    c.json(meResponseSchema.parse({ user: c.get("user") })),
  )
  .patch(
    "/",
    requireScope("write:profile"),
    requireCurrentPolicies,
    zV("json", patchMeSchema),
    async (c) => {
      const { name } = c.req.valid("json");
      await updateUserName(c.get("user").id, name);
      return c.json({ ok: true });
    },
  );
