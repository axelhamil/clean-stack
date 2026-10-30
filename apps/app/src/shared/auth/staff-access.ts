import { STAFF_PERMISSIONS, STAFF_ROLES, type StaffPermission } from "@packages/access-control";
import { z } from "zod";

const staffAccessSchema = z.object({
  role: z.enum(STAFF_ROLES),
  permissions: z.array(z.enum(STAFF_PERMISSIONS)),
  mfaOk: z.boolean(),
});

const sessionWithStaffSchema = z.object({ staff: staffAccessSchema });

export type StaffAccess = z.infer<typeof staffAccessSchema>;

export function staffOf(session: unknown): StaffAccess | null {
  const parsed = sessionWithStaffSchema.safeParse(session);

  return parsed.success ? parsed.data.staff : null;
}

export function staffCan(staff: StaffAccess | null, permission: StaffPermission): boolean {
  return staff?.mfaOk === true && staff.permissions.includes(permission);
}
