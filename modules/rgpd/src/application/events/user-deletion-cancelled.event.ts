import { EventTypes, type UserDeletionCancelledPayload } from "@packages/events";
import type { z } from "zod";

export function userDeletionCancelledEvent(fact: { userId: string }) {
  const payload: z.infer<typeof UserDeletionCancelledPayload> = { userId: fact.userId };

  return {
    type: EventTypes.USER_DELETION_CANCELLED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
