import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AdminUserRow } from "../../../../application/ports/repositories/admin-user-store.port";
import type { IAuthProvider } from "../../../../application/ports/services/auth-provider.port";
import type {
  AdminUserDetail,
  IGetUserQuery,
} from "../../../../application/queries/get-user.query";
import type { IListStaffNotesQuery } from "../../../../application/queries/list-staff-notes.query";
import type { IListUsersQuery } from "../../../../application/queries/list-users.query";
import type { AddStaffNoteUseCase } from "../../../../application/usecases/add-staff-note/add-staff-note.usecase";
import type { BanUserUseCase } from "../../../../application/usecases/ban-user/ban-user.usecase";
import type { ResetUserPasswordUseCase } from "../../../../application/usecases/reset-user-password/reset-user-password.usecase";
import type { RevokeUserSessionsUseCase } from "../../../../application/usecases/revoke-user-sessions/revoke-user-sessions.usecase";
import type { UnbanUserUseCase } from "../../../../application/usecases/unban-user/unban-user.usecase";
import { gatedResponse } from "../../approval-gate.response";
import { serializeStaffNote } from "../../staff-note.presenter";
import { addStaffNoteBodySchema } from "../../staff-note.schema";
import { banUserBodySchema, listUsersQuerySchema } from "./admin.schema";

export interface AdminUserRoutesDeps {
  routeGuards: RouteGuards;
  IAuthProvider: Pick<IAuthProvider, "requestPasswordReset">;
  IListUsersQuery: IListUsersQuery;
  IGetUserQuery: IGetUserQuery;
  IListStaffNotesQuery: IListStaffNotesQuery;
  BanUserUseCase: Pick<BanUserUseCase, "execute">;
  UnbanUserUseCase: Pick<UnbanUserUseCase, "execute">;
  ResetUserPasswordUseCase: Pick<ResetUserPasswordUseCase, "execute">;
  RevokeUserSessionsUseCase: Pick<RevokeUserSessionsUseCase, "execute">;
  AddStaffNoteUseCase: Pick<AddStaffNoteUseCase, "execute">;
}

async function findUserOr404(query: IGetUserQuery, userId: string): Promise<AdminUserDetail> {
  const result = await query.execute({ userId });
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
        const result = await deps.IListUsersQuery.execute(c.req.valid("query"));
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
        const u = await findUserOr404(deps.IGetUserQuery, c.req.valid("param").id);
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
      async (c) =>
        gatedResponse(
          c,
          await deps.BanUserUseCase.execute({
            actorUserId: g.currentUserId(c),
            actorPermissions: g.currentStaff(c).permissions,
            userId: c.req.valid("param").id,
            ban: c.req.valid("json"),
            confirmStepUp: () => g.assertStepUp(c),
          }),
        ),
    )
    .post(
      "/:id/unban",
      g.requireAuth,
      g.requireStaffPermission("users.moderate"),
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.UnbanUserUseCase.execute({
          actorUserId: g.currentUserId(c),
          actorPermissions: g.currentStaff(c).permissions,
          userId: c.req.valid("param").id,
        });
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
        const userId = c.req.valid("param").id;
        const u = await findUserOr404(deps.IGetUserQuery, userId);
        const result = await deps.ResetUserPasswordUseCase.execute({
          actorUserId: g.currentUserId(c),
          actorPermissions: g.currentStaff(c).permissions,
          userId,
          requestReset: () => deps.IAuthProvider.requestPasswordReset(u.email),
        });
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
        const userId = c.req.valid("param").id;
        await findUserOr404(deps.IGetUserQuery, userId);
        const result = await deps.RevokeUserSessionsUseCase.execute({
          actorUserId: g.currentUserId(c),
          actorPermissions: g.currentStaff(c).permissions,
          userId,
        });
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
        const result = await deps.IListStaffNotesQuery.execute({
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
        const result = await deps.AddStaffNoteUseCase.execute({
          actorUserId: g.currentUserId(c),
          subject: { type: "user", id: c.req.valid("param").id },
          body: c.req.valid("json").body,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    );
}
