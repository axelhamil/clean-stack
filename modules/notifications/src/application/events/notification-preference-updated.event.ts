import { EventTypes, type NotificationPreferenceUpdatedPayload } from "@packages/events";
import type { z } from "zod";

export function notificationPreferenceUpdatedEvent(
  payload: z.infer<typeof NotificationPreferenceUpdatedPayload>,
) {
  return {
    type: EventTypes.NOTIFICATION_PREFERENCE_UPDATED,
    aggregateType: "notification_preference",
    aggregateId: payload.userId,
    payload,
  };
}
