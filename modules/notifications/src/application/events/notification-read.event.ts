import { EventTypes, type NotificationReadPayload } from "@packages/events";
import type { z } from "zod";

export function notificationReadEvent(payload: z.infer<typeof NotificationReadPayload>) {
  return {
    type: EventTypes.NOTIFICATION_READ,
    aggregateType: "notification",
    aggregateId: payload.userId,
    payload,
  };
}
