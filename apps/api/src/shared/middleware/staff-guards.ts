import {
  authorizeStaff,
  STAFF_REFUSAL,
  type StaffAccess,
  type StaffPermission,
} from "@packages/access-control";
import { AppErrorException, type Option, type Result } from "@packages/ddd-kit";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { SessionData, SessionUser } from "../../auth";
import type { StaffStoreError } from "../ports/staff-store.port";
import type { StaffSessionRef } from "../services/staff-access.service";
import type { StaffUser } from "../staff-access";

export interface StaffGate {
  gate(
    user: StaffUser,
    session: StaffSessionRef,
  ): Promise<Result<Option<StaffAccess>, StaffStoreError>>;
}

export type StaffVariables = {
  user: SessionUser;
  session: SessionData;
  staff: StaffAccess;
};

export function staffGuards(gate: () => StaffGate) {
  async function resolve(c: Context<{ Variables: StaffVariables }>): Promise<StaffAccess> {
    const decided = await gate().gate(c.get("user"), c.get("session"));
    if (decided.isFailure) throw new AppErrorException(decided.getError());

    const access = decided.getValue();
    if (access.isNone()) {
      throw new AppErrorException({
        code: STAFF_REFUSAL.notStaff,
        message: "Staff access required.",
      });
    }

    const staff = access.unwrap();
    if (!staff.mfaOk) {
      throw new AppErrorException({
        code: STAFF_REFUSAL.mfaMissing,
        message: "Staff access requires two-factor authentication.",
      });
    }

    c.set("staff", staff);

    return staff;
  }

  return {
    requireStaff: createMiddleware<{ Variables: StaffVariables }>(async (c, next) => {
      await resolve(c);
      await next();
    }),
    requireStaffPermission: (permission: StaffPermission) =>
      createMiddleware<{ Variables: StaffVariables }>(async (c, next) => {
        const staff = await resolve(c);
        if (!authorizeStaff(staff, permission)) {
          throw new AppErrorException({
            code: STAFF_REFUSAL.permissionMissing,
            message: `This action requires the ${permission} permission.`,
          });
        }

        await next();
      }),
  };
}
