import { type StaffAccess, staffAccessSchema } from "@packages/access-control";
import { z } from "zod";

const sessionWithStaffSchema = z.object({ staff: staffAccessSchema });

export function staffOf(session: unknown): StaffAccess | null {
  const parsed = sessionWithStaffSchema.safeParse(session);

  return parsed.success ? parsed.data.staff : null;
}
