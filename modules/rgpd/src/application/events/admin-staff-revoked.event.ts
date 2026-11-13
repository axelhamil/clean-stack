import { type AdminStaffRevokedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";

export interface StaffLeftByErasure {
  userId: string;
  role: string;
}

export function adminStaffRevokedEvent(fact: StaffLeftByErasure) {
  const payload: z.infer<typeof AdminStaffRevokedPayload> = {
    actorUserId: fact.userId,
    userId: fact.userId,
    role: fact.role,
  };

  return {
    type: EventTypes.ADMIN_STAFF_REVOKED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
