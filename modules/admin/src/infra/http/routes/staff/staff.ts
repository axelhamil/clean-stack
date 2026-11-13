import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { IListStaffQuery } from "../../../../application/queries/list-staff.query";
import type { IListStaffOverridesQuery } from "../../../../application/queries/list-staff-overrides.query";
import type { IStepUpValidityQuery } from "../../../../application/queries/step-up-validity.query";
import type { ChangeStaffRoleUseCase } from "../../../../application/usecases/change-staff-role/change-staff-role.usecase";
import type { RemoveStaffOverrideUseCase } from "../../../../application/usecases/remove-staff-override/remove-staff-override.usecase";
import type { RevokeStaffUseCase } from "../../../../application/usecases/revoke-staff/revoke-staff.usecase";
import type { SetStaffOverrideUseCase } from "../../../../application/usecases/set-staff-override/set-staff-override.usecase";
import type { VerifyStepUpUseCase } from "../../../../application/usecases/verify-step-up/verify-step-up.usecase";
import type { StaffEnv } from "../../../../domain/staff/services/staff-access.service";
import { staffNotFound } from "../../../../domain/staff/services/staff-rules.service";
import { gatedResponse } from "../../approval-gate.response";
import {
  setStaffOverrideBodySchema,
  setStaffRoleBodySchema,
  staffOverrideParamSchema,
  stepUpBodySchema,
} from "./staff.schema";

export interface AdminStaffRoutesDeps {
  routeGuards: RouteGuards;
  staffSettings: Pick<StaffEnv, "PLATFORM_ADMIN_REQUIRE_MFA">;
  IStepUpValidityQuery: IStepUpValidityQuery;
  VerifyStepUpUseCase: Pick<VerifyStepUpUseCase, "execute">;
  IListStaffQuery: IListStaffQuery;
  IListStaffOverridesQuery: IListStaffOverridesQuery;
  ChangeStaffRoleUseCase: Pick<ChangeStaffRoleUseCase, "execute">;
  RevokeStaffUseCase: Pick<RevokeStaffUseCase, "execute">;
  SetStaffOverrideUseCase: Pick<SetStaffOverrideUseCase, "execute">;
  RemoveStaffOverrideUseCase: Pick<RemoveStaffOverrideUseCase, "execute">;
}

export function createAdminStaffRoutes(deps: AdminStaffRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/me", g.requireAuth, g.requireStaff, async (c) => {
      const session = g.currentSession(c);
      const staff = g.currentStaff(c);
      const stepUp = await deps.IStepUpValidityQuery.execute({ sessionId: session.id });
      if (stepUp.isFailure) throw new AppErrorException(stepUp.getError());

      return c.json({
        id: session.userId,
        email: session.email,
        role: staff.role,
        permissions: staff.permissions,
        mfa: session.twoFactorEnabled,
        stepUpValidUntil: stepUp
          .getValue()
          .map((date) => date.toISOString())
          .toNull(),
        policy: { requireMfa: deps.staffSettings.PLATFORM_ADMIN_REQUIRE_MFA },
      });
    })
    .post("/step-up", g.requireAuth, g.requireStaff, zV("json", stepUpBodySchema), async (c) => {
      const session = g.currentSession(c);
      const result = await deps.VerifyStepUpUseCase.execute({
        userId: session.userId,
        sessionId: session.id,
        code: c.req.valid("json").code,
        ip: g.clientIp(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ validUntil: result.getValue().validUntil.toISOString() });
    })
    .get("/staff", g.requireAuth, g.requireStaffPermission("staff.manage"), async (c) => {
      const result = await deps.IListStaffQuery.execute();
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({
        items: result.getValue().map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    })
    .put(
      "/staff/:id/role",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      g.requireStepUp,
      zV("json", setStaffRoleBodySchema),
      zV("param", idParamSchema),
      async (c) =>
        gatedResponse(
          c,
          await deps.ChangeStaffRoleUseCase.execute({
            actorUserId: g.currentUserId(c),
            actorPermissions: g.currentStaff(c).permissions,
            targetUserId: c.req.valid("param").id,
            change: c.req.valid("json"),
          }),
        ),
    )
    .delete(
      "/staff/:id",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      g.requireStepUp,
      zV("param", idParamSchema),
      async (c) =>
        gatedResponse(
          c,
          await deps.RevokeStaffUseCase.execute({
            actorUserId: g.currentUserId(c),
            actorPermissions: g.currentStaff(c).permissions,
            targetUserId: c.req.valid("param").id,
          }),
        ),
    )
    .get(
      "/staff/:id/overrides",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.IListStaffOverridesQuery.execute({
          userId: c.req.valid("param").id,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        const live = result.getValue();
        if (live.isNone()) throw new AppErrorException(staffNotFound());

        return c.json({
          items: live.unwrap().map((row) => ({
            id: row.id,
            permission: row.permission,
            effect: row.effect,
            expiresAt: row.expiresAt.map((date) => date.toISOString()).toNull(),
            createdAt: row.createdAt.toISOString(),
          })),
        });
      },
    )
    .post(
      "/staff/:id/overrides",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      g.requireStepUp,
      zV("json", setStaffOverrideBodySchema),
      zV("param", idParamSchema),
      async (c) =>
        gatedResponse(
          c,
          await deps.SetStaffOverrideUseCase.execute({
            actorUserId: g.currentUserId(c),
            actorPermissions: g.currentStaff(c).permissions,
            targetUserId: c.req.valid("param").id,
            override: c.req.valid("json"),
          }),
        ),
    )
    .delete(
      "/staff/:id/overrides/:overrideId",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      g.requireStepUp,
      zV("param", staffOverrideParamSchema),
      async (c) => {
        const { id, overrideId } = c.req.valid("param");

        return gatedResponse(
          c,
          await deps.RemoveStaffOverrideUseCase.execute({
            actorUserId: g.currentUserId(c),
            actorPermissions: g.currentStaff(c).permissions,
            targetUserId: id,
            overrideId,
          }),
        );
      },
    );
}
