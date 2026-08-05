import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requirePlatformAdmin } from "../../shared/middleware/platform-admin.middleware";
import { zV } from "../../shared/validator";
import { listUsersQuerySchema } from "./application/dto/list-users.dto";

export const adminUserRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/", requireAuth, requirePlatformAdmin, zV("query", listUsersQuerySchema), async (c) => {
    const result = await di.AdminQueryService.listUsers(c.req.valid("query"));
    if (result.isFailure) throw new AppErrorException(result.getError());
    const page = result.getValue();
    return c.json({
      items: page.items.map((u) => ({
        ...u,
        role: u.role.toNull(),
        banReason: u.banReason.toNull(),
        banExpires: u.banExpires.toNull()?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor.toNull(),
    });
  })
  .get("/:id", requireAuth, requirePlatformAdmin, async (c) => {
    const result = await di.AdminQueryService.getUser(c.req.param("id"));
    if (result.isFailure) throw new AppErrorException(result.getError());
    const found = result.getValue();
    if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_USER_NOT_FOUND" });
    const u = found.unwrap();
    return c.json({
      ...u,
      role: u.role.toNull(),
      banReason: u.banReason.toNull(),
      banExpires: u.banExpires.toNull()?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      sessions: u.sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        ipAddress: s.ipAddress.toNull(),
        userAgent: s.userAgent.toNull(),
        impersonatedBy: s.impersonatedBy.toNull(),
      })),
    });
  });
