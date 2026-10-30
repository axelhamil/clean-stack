import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireStaffPermission } from "../../shared/middleware/staff.middleware";
import { AdminActionService } from "../../shared/services/admin-action.service";
import { zV } from "../../shared/validator";
import { banUserBodySchema } from "./application/dto/ban-user.dto";
import { listUsersQuerySchema } from "./application/dto/list-users.dto";
import type { AdminUserRow } from "./application/ports/admin-user-store.port";
import type { AdminUserDetail } from "./application/services/admin-query.service";

const actionSvc = new AdminActionService(
  di.IOutboxRepository,
  di.ITransactionService,
  di.IInstrumentation,
);

async function findUserOr404(userId: string): Promise<AdminUserDetail> {
  const result = await di.AdminQueryService.getUser(userId);
  if (result.isFailure) throw new AppErrorException(result.getError());

  const found = result.getValue();
  if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_USER_NOT_FOUND" });

  return found.unwrap();
}

function serializeUser(u: AdminUserRow) {
  return {
    ...u,
    banReason: u.banReason.toNull(),
    banExpires: u.banExpires.map((d) => d.toISOString()).toNull(),
    createdAt: u.createdAt.toISOString(),
  };
}

export const adminUserRoutes = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    requireAuth,
    requireStaffPermission("users.read"),
    zV("query", listUsersQuerySchema),
    async (c) => {
      const result = await di.AdminQueryService.listUsers(c.req.valid("query"));
      if (result.isFailure) throw new AppErrorException(result.getError());
      const page = result.getValue();
      return c.json({
        items: page.items.map(serializeUser),
        nextCursor: page.nextCursor.toNull(),
      });
    },
  )
  .get("/:id", requireAuth, requireStaffPermission("users.read"), async (c) => {
    const u = await findUserOr404(c.req.param("id"));
    return c.json({
      ...serializeUser(u),
      sessions: u.sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        ipAddress: s.ipAddress.toNull(),
        userAgent: s.userAgent.toNull(),
        impersonatedBy: s.impersonatedBy.toNull(),
      })),
      memberships: u.memberships,
    });
  })
  .post(
    "/:id/ban",
    requireAuth,
    requireStaffPermission("users.moderate"),
    zV("json", banUserBodySchema),
    async (c) => {
      const actor = c.get("user");
      const userId = c.req.param("id");
      const body = c.req.valid("json");
      const result = await di.StaffService.moderateBan(
        { actorPermissions: c.get("staff").permissions, targetUserId: userId },
        () =>
          actionSvc.ban({
            actorUserId: actor.id,
            userId,
            reason: body.reason,
            expiresIn: body.expiresIn,
            headers: c.req.raw.headers,
          }),
      );
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ ok: true });
    },
  )
  .post("/:id/unban", requireAuth, requireStaffPermission("users.moderate"), async (c) => {
    const actor = c.get("user");
    const userId = c.req.param("id");
    const result = await di.StaffService.moderate(
      { actorPermissions: c.get("staff").permissions, targetUserId: userId },
      () => actionSvc.unban({ actorUserId: actor.id, userId, headers: c.req.raw.headers }),
    );
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  })
  .post("/:id/reset-password", requireAuth, requireStaffPermission("users.moderate"), async (c) => {
    const actor = c.get("user");
    const userId = c.req.param("id");
    const u = await findUserOr404(userId);
    const result = await di.StaffService.moderate(
      { actorPermissions: c.get("staff").permissions, targetUserId: userId },
      () =>
        actionSvc.resetPassword({
          actorUserId: actor.id,
          userId,
          email: u.email,
          headers: c.req.raw.headers,
        }),
    );
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  })
  .delete("/:id/sessions", requireAuth, requireStaffPermission("users.moderate"), async (c) => {
    const actor = c.get("user");
    const userId = c.req.param("id");
    const u = await findUserOr404(userId);
    const result = await di.StaffService.moderate(
      { actorPermissions: c.get("staff").permissions, targetUserId: userId },
      () =>
        actionSvc.revokeSessions({
          actorUserId: actor.id,
          userId,
          count: u.sessions.length,
          headers: c.req.raw.headers,
        }),
    );
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  });
