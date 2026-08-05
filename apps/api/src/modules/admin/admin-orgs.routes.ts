import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requirePlatformAdmin } from "../../shared/middleware/platform-admin.middleware";
import { zV } from "../../shared/validator";
import { listOrgsQuerySchema } from "./application/dto/list-orgs.dto";

export const adminOrgRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/", requireAuth, requirePlatformAdmin, zV("query", listOrgsQuerySchema), async (c) => {
    const result = await di.AdminQueryService.listOrgs(c.req.valid("query"));
    if (result.isFailure) throw new AppErrorException(result.getError());
    const page = result.getValue();
    return c.json({
      items: page.items.map((o) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor.toNull(),
    });
  })
  .get("/:id", requireAuth, requirePlatformAdmin, async (c) => {
    const result = await di.AdminQueryService.getOrg(c.req.param("id"));
    if (result.isFailure) throw new AppErrorException(result.getError());
    const found = result.getValue();
    if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_ORG_NOT_FOUND" });
    const o = found.unwrap();
    return c.json({
      ...o,
      createdAt: o.createdAt.toISOString(),
      plan: o.plan.toNull(),
    });
  });
