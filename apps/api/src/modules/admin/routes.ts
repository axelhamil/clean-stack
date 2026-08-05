import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requirePlatformAdmin } from "../../shared/middleware/platform-admin.middleware";
import { zV } from "../../shared/validator";
import { banUserBodySchema } from "./application/dto/ban-user.dto";
import { listUsersQuerySchema } from "./application/dto/list-users.dto";
import { setRoleBodySchema } from "./application/dto/set-role.dto";
import { AdminActionService } from "./application/services/admin-action.service";

const actionSvc = new AdminActionService(di.IOutboxRepository, di.IInstrumentation);

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
  })
  .post("/:id/ban", requireAuth, requirePlatformAdmin, zV("json", banUserBodySchema), async (c) => {
    const actor = c.get("user");
    const body = c.req.valid("json");
    const result = await actionSvc.ban({
      actorUserId: actor.id,
      userId: c.req.param("id"),
      reason: body.reason,
      expiresIn: body.expiresIn,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  })
  .post("/:id/unban", requireAuth, requirePlatformAdmin, async (c) => {
    const actor = c.get("user");
    const result = await actionSvc.unban({
      actorUserId: actor.id,
      userId: c.req.param("id"),
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  })
  .put("/:id/role", requireAuth, requirePlatformAdmin, zV("json", setRoleBodySchema), async (c) => {
    const actor = c.get("user");
    const body = c.req.valid("json");
    const userId = c.req.param("id");
    const userResult = await di.AdminQueryService.getUser(userId);
    if (userResult.isFailure) throw new AppErrorException(userResult.getError());
    const found = userResult.getValue();
    if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_USER_NOT_FOUND" });
    const u = found.unwrap();
    const result = await actionSvc.setRole({
      actorUserId: actor.id,
      userId,
      role: body.role,
      previousRole: u.role.toNull(),
      headers: c.req.raw.headers,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  })
  .post("/:id/reset-password", requireAuth, requirePlatformAdmin, async (c) => {
    const actor = c.get("user");
    const userId = c.req.param("id");
    const userResult = await di.AdminQueryService.getUser(userId);
    if (userResult.isFailure) throw new AppErrorException(userResult.getError());
    const found = userResult.getValue();
    if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_USER_NOT_FOUND" });
    const u = found.unwrap();
    const result = await actionSvc.resetPassword({
      actorUserId: actor.id,
      userId,
      email: u.email,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  })
  .delete("/:id/sessions", requireAuth, requirePlatformAdmin, async (c) => {
    const actor = c.get("user");
    const userId = c.req.param("id");
    const userResult = await di.AdminQueryService.getUser(userId);
    if (userResult.isFailure) throw new AppErrorException(userResult.getError());
    const found = userResult.getValue();
    if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_USER_NOT_FOUND" });
    const u = found.unwrap();
    const result = await actionSvc.revokeSessions({
      actorUserId: actor.id,
      userId,
      count: u.sessions.length,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  });
