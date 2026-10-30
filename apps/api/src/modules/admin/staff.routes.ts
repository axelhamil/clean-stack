import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { env } from "../../shared/env";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { resolveClientIp } from "../../shared/middleware/rate-limit.ip";
import {
  requireStaff,
  requireStaffPermission,
  requireStepUp,
} from "../../shared/middleware/staff.middleware";
import { zV } from "../../shared/validator";
import { setStaffRoleBodySchema } from "./application/dto/set-staff-role.dto";
import { stepUpBodySchema } from "./application/dto/step-up.dto";

export const adminStaffRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/me", requireAuth, requireStaff, async (c) => {
    const user = c.get("user");
    const staff = c.get("staff");
    const stepUp = await di.StepUpService.validUntil(c.get("session").id);
    if (stepUp.isFailure) throw new AppErrorException(stepUp.getError());

    return c.json({
      id: user.id,
      email: user.email,
      role: staff.role,
      permissions: staff.permissions,
      mfa: user.twoFactorEnabled === true,
      stepUpValidUntil: stepUp
        .getValue()
        .map((date) => date.toISOString())
        .toNull(),
      policy: { requireMfa: env.PLATFORM_ADMIN_REQUIRE_MFA },
    });
  })
  .post("/step-up", requireAuth, requireStaff, zV("json", stepUpBodySchema), async (c) => {
    const user = c.get("user");
    const result = await di.StepUpService.verify({
      userId: user.id,
      sessionId: c.get("session").id,
      code: c.req.valid("json").code,
      ip: resolveClientIp(c),
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({ validUntil: result.getValue().validUntil.toISOString() });
  })
  .get("/staff", requireAuth, requireStaffPermission("staff.manage"), async (c) => {
    const result = await di.StaffService.list();
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
    requireAuth,
    requireStaffPermission("staff.manage"),
    requireStepUp,
    zV("json", setStaffRoleBodySchema),
    async (c) => {
      const result = await di.StaffService.assignRole({
        actorUserId: c.get("user").id,
        targetUserId: c.req.param("id"),
        role: c.req.valid("json").role,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    },
  )
  .delete(
    "/staff/:id",
    requireAuth,
    requireStaffPermission("staff.manage"),
    requireStepUp,
    async (c) => {
      const result = await di.StaffService.revoke({
        actorUserId: c.get("user").id,
        targetUserId: c.req.param("id"),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    },
  );
