import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { env } from "../../shared/env";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireStaff, requireStaffPermission } from "../../shared/middleware/staff.middleware";
import { zV } from "../../shared/validator";
import { setStaffRoleBodySchema } from "./application/dto/set-staff-role.dto";

export const adminStaffRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/me", requireAuth, requireStaff, (c) => {
    const user = c.get("user");
    const staff = c.get("staff");

    return c.json({
      id: user.id,
      email: user.email,
      role: staff.role,
      permissions: staff.permissions,
      mfa: user.twoFactorEnabled === true,
      stepUpValidUntil: null,
      policy: { requireMfa: env.PLATFORM_ADMIN_REQUIRE_MFA },
    });
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
  .delete("/staff/:id", requireAuth, requireStaffPermission("staff.manage"), async (c) => {
    const result = await di.StaffService.revoke({
      actorUserId: c.get("user").id,
      targetUserId: c.req.param("id"),
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({ ok: true });
  });
