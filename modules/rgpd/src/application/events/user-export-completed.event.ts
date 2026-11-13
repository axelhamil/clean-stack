import { EventTypes, type UserExportCompletedPayload } from "@packages/events";
import type { z } from "zod";

export interface UserExportCompleted {
  userId: string;
  storageKey: string;
  expiresAt: Date;
}

export function userExportCompletedEvent(fact: UserExportCompleted) {
  const payload: z.infer<typeof UserExportCompletedPayload> = {
    userId: fact.userId,
    storageKey: fact.storageKey,
    expiresAt: fact.expiresAt,
  };

  return {
    type: EventTypes.USER_EXPORT_COMPLETED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
