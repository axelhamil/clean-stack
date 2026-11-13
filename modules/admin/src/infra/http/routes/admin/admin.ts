import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { banUserBodySchema } from "../../../../application/approved-action";
import type { AdminUserRow } from "../../../../application/ports/repositories/admin-user-store.port";
import type { IAuthProvider } from "../../../../application/ports/services/auth-provider.port";
import type { AdminModerationService } from "../../../../application/services/admin-moderation.service";
import type {
  AdminQueryService,
  AdminUserDetail,
} from "../../../../application/services/admin-query.service";
import type { ApprovalService } from "../../../../application/services/approval.service";
import type { StaffService } from "../../../../application/services/staff.service";
import type { StaffNoteService } from "../../../../application/services/staff-note.service";
import { gateOr202 } from "../../approval-gate.response";
import { serializeStaffNote } from "../../staff-note.presenter";
import { addStaffNoteBodySchema } from "../../staff-note.schema";
import { listUsersQuerySchema } from "./admin.schema";

export interface AdminUserRoutesDeps {
  routeGuards: RouteGuards;
  IAuthProvider: Pick<IAuthProvider, "requestPasswordReset">;
  AdminQueryService: Pick<AdminQueryService, "listUsers" | "getUser">;
  AdminModerationService: Pick<
    AdminModerationService,
    "ban" | "unban" | "resetPassword" | "revokeSessions"
  >;
  ApprovalService: Pick<ApprovalService, "gate">;
  StaffService: Pick<StaffService, "banIsSensitive" | "moderate" | "moderateBan">;
  StaffNoteService: Pick<StaffNoteService, "list" | "add">;
}

async function findUserOr404(
  queries: AdminUserRoutesDeps["AdminQueryService"],
  userId: string,
): Promise<AdminUserDetail> {
  const result = await queries.getUser(userId);
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

export function createAdminUserRoutes(deps: AdminUserRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get(
      "/",
      g.requireAuth,
      g.requireStaffPermission("users.read"),
      zV("query", listUsersQuerySchema),
      async (c) => {
        const result = await deps.AdminQueryService.listUsers(c.req.valid("query"));
        if (result.isFailure) throw new AppErrorException(result.getError());
        const page = result.getValue();
        return c.json({
          items: page.items.map(serializeUser),
          nextCursor: page.nextCursor.toNull(),
        });
      },
    )
    .get(
      "/:id",
      g.requireAuth,
      g.requireStaffPermission("users.read"),
      zV("param", idParamSchema),
      async (c) => {
        const u = await findUserOr404(deps.AdminQueryService, c.req.valid("param").id);
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
      },
    )
    .post(
      "/:id/ban",
      g.requireAuth,
      g.requireStaffPermission("users.moderate"),
      zV("json", banUserBodySchema),
      zV("param", idParamSchema),
      async (c) => {
        const actorId = g.currentUserId(c);
        const userId = c.req.valid("param").id;
        const body = c.req.valid("json");
        const sensitive = await deps.StaffService.banIsSensitive({
          targetUserId: userId,
          expiresIn: body.expiresIn,
        });
        if (sensitive.isFailure) throw new AppErrorException(sensitive.getError());

        if (sensitive.getValue()) {
          await g.assertStepUp(c);

          const pending = gateOr202(
            c,
            await deps.ApprovalService.gate({
              action: "user.ban_permanent",
              subjectId: userId,
              params: body,
              requestedBy: actorId,
              requesterPermissions: g.currentStaff(c).permissions,
            }),
          );
          if (pending) return pending;
        }

        const result = await deps.StaffService.moderateBan(
          { actorPermissions: g.currentStaff(c).permissions, targetUserId: userId },
          () =>
            deps.AdminModerationService.ban({
              actorUserId: actorId,
              userId,
              reason: body.reason,
              expiresIn: body.expiresIn,
            }),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ ok: true });
      },
    )
    .post(
      "/:id/unban",
      g.requireAuth,
      g.requireStaffPermission("users.moderate"),
      zV("param", idParamSchema),
      async (c) => {
        const actorId = g.currentUserId(c);
        const userId = c.req.valid("param").id;
        const result = await deps.StaffService.moderate(
          { actorPermissions: g.currentStaff(c).permissions, targetUserId: userId },
          () => deps.AdminModerationService.unban({ actorUserId: actorId, userId }),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ ok: true });
      },
    )
    .post(
      "/:id/reset-password",
      g.requireAuth,
      g.requireStaffPermission("users.moderate"),
      zV("param", idParamSchema),
      async (c) => {
        const actorId = g.currentUserId(c);
        const userId = c.req.valid("param").id;
        const u = await findUserOr404(deps.AdminQueryService, userId);
        const result = await deps.StaffService.moderate(
          { actorPermissions: g.currentStaff(c).permissions, targetUserId: userId },
          () =>
            deps.AdminModerationService.resetPassword({ actorUserId: actorId, userId }, () =>
              deps.IAuthProvider.requestPasswordReset(u.email),
            ),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ ok: true });
      },
    )
    .delete(
      "/:id/sessions",
      g.requireAuth,
      g.requireStaffPermission("users.moderate"),
      zV("param", idParamSchema),
      async (c) => {
        const actorId = g.currentUserId(c);
        const userId = c.req.valid("param").id;
        await findUserOr404(deps.AdminQueryService, userId);
        const result = await deps.StaffService.moderate(
          { actorPermissions: g.currentStaff(c).permissions, targetUserId: userId },
          () => deps.AdminModerationService.revokeSessions({ actorUserId: actorId, userId }),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ ok: true });
      },
    )
    .get(
      "/:id/notes",
      g.requireAuth,
      g.requireStaffPermission("users.read"),
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.StaffNoteService.list({
          type: "user",
          id: c.req.valid("param").id,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ items: result.getValue().map(serializeStaffNote) });
      },
    )
    .post(
      "/:id/notes",
      g.requireAuth,
      g.requireStaffPermission("notes.write"),
      zV("json", addStaffNoteBodySchema),
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.StaffNoteService.add({
          actorUserId: g.currentUserId(c),
          subject: { type: "user", id: c.req.valid("param").id },
          body: c.req.valid("json").body,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    );
}
