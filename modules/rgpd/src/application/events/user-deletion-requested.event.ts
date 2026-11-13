import { EventTypes, type UserDeletionRequestedPayload } from "@packages/events";
import type { z } from "zod";

export interface UserDeletionRequested {
  userId: string;
  pendingDeletionUntil: Date;
}

export function userDeletionRequestedEvent(fact: UserDeletionRequested) {
  const payload: z.infer<typeof UserDeletionRequestedPayload> = {
    userId: fact.userId,
    pendingDeletionUntil: fact.pendingDeletionUntil,
  };

  return {
    type: EventTypes.USER_DELETION_REQUESTED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
