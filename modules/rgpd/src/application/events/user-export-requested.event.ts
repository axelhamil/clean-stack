import { EventTypes, type UserExportRequestedPayload } from "@packages/events";
import type { z } from "zod";

export function userExportRequestedEvent(fact: { userId: string }) {
  const payload: z.infer<typeof UserExportRequestedPayload> = { userId: fact.userId };

  return {
    type: EventTypes.USER_EXPORT_REQUESTED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
