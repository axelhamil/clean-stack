import { AppErrorException, Option } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { setStaffRoleBodySchema } from "../../application/dto/set-staff-role.dto";
import { setStaffOverrideBodySchema } from "../../application/dto/staff-override.dto";
import { stepUpBodySchema } from "../../application/dto/step-up.dto";
import type { ApprovalService } from "../../application/services/approval.service";
import type { StaffService } from "../../application/services/staff.service";
import type { StaffEnv } from "../../application/services/staff-access";
import type { StepUpService } from "../../application/services/step-up.service";
import { gateOr202 } from "./approval-response";

export interface AdminStaffRoutesDeps {
  routeGuards: RouteGuards;
  staffSettings: Pick<StaffEnv, "PLATFORM_ADMIN_REQUIRE_MFA">;
  StepUpService: Pick<StepUpService, "validUntil" | "verify">;
  ApprovalService: Pick<ApprovalService, "gate">;
  StaffService: Pick<
    StaffService,
    "list" | "assignRole" | "revoke" | "listOverrides" | "setOverride" | "removeOverride"
  >;
}

export function createAdminStaffRoutes(deps: AdminStaffRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/me", g.requireAuth, g.requireStaff, async (c) => {
      const session = g.currentSession(c);
      const staff = g.currentStaff(c);
      const stepUp = await deps.StepUpService.validUntil(session.id);
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
      const result = await deps.StepUpService.verify({
        userId: session.userId,
        sessionId: session.id,
        code: c.req.valid("json").code,
        ip: g.clientIp(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ validUntil: result.getValue().validUntil.toISOString() });
    })
    .get("/staff", g.requireAuth, g.requireStaffPermission("staff.manage"), async (c) => {
      const result = await deps.StaffService.list();
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
      async (c) => {
        const actorUserId = g.currentUserId(c);
        const targetUserId = c.req.param("id");
        const body = c.req.valid("json");
        const pending = gateOr202(
          c,
          await deps.ApprovalService.gate({
            action: "staff.role_change",
            subjectId: targetUserId,
            params: body,
            requestedBy: actorUserId,
            requesterPermissions: g.currentStaff(c).permissions,
          }),
        );
        if (pending) return pending;

        const result = await deps.StaffService.assignRole({
          actorUserId,
          actorPermissions: g.currentStaff(c).permissions,
          targetUserId,
          role: body.role,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .delete(
      "/staff/:id",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      g.requireStepUp,
      async (c) => {
        const actorUserId = g.currentUserId(c);
        const targetUserId = c.req.param("id");
        const pending = gateOr202(
          c,
          await deps.ApprovalService.gate({
            action: "staff.revoke",
            subjectId: targetUserId,
            params: {},
            requestedBy: actorUserId,
            requesterPermissions: g.currentStaff(c).permissions,
          }),
        );
        if (pending) return pending;

        const result = await deps.StaffService.revoke({ actorUserId, targetUserId });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .get(
      "/staff/:id/overrides",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      async (c) => {
        const result = await deps.StaffService.listOverrides(c.req.param("id"));
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({
          items: result.getValue().map((row) => ({
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
      async (c) => {
        const actorUserId = g.currentUserId(c);
        const targetUserId = c.req.param("id");
        const body = c.req.valid("json");
        const pending = gateOr202(
          c,
          await deps.ApprovalService.gate({
            action: "staff.permission_override",
            subjectId: targetUserId,
            params: { op: "set", ...body },
            requestedBy: actorUserId,
            requesterPermissions: g.currentStaff(c).permissions,
          }),
        );
        if (pending) return pending;

        const result = await deps.StaffService.setOverride({
          actorUserId,
          actorPermissions: g.currentStaff(c).permissions,
          targetUserId,
          permission: body.permission,
          effect: body.effect,
          expiresAt: Option.fromNullable(body.expiresAt).map((iso) => new Date(iso)),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .delete(
      "/staff/:id/overrides/:overrideId",
      g.requireAuth,
      g.requireStaffPermission("staff.manage"),
      g.requireStepUp,
      async (c) => {
        const actorUserId = g.currentUserId(c);
        const targetUserId = c.req.param("id");
        const overrideId = c.req.param("overrideId");
        const pending = gateOr202(
          c,
          await deps.ApprovalService.gate({
            action: "staff.permission_override",
            subjectId: targetUserId,
            params: { op: "revoke", overrideId },
            requestedBy: actorUserId,
            requesterPermissions: g.currentStaff(c).permissions,
          }),
        );
        if (pending) return pending;

        const result = await deps.StaffService.removeOverride({
          actorUserId,
          actorPermissions: g.currentStaff(c).permissions,
          targetUserId,
          overrideId,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    );
}
