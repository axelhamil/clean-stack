import { EventTypes, type UserDeletedPayload } from "@packages/events";
import type { z } from "zod";

export interface UserDeleted {
  userId: string;
  deletedAt: Date;
}

export function userDeletedEvent(fact: UserDeleted) {
  const payload: z.infer<typeof UserDeletedPayload> = {
    userId: fact.userId,
    deletedAt: fact.deletedAt,
  };

  return {
    type: EventTypes.USER_DELETED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
