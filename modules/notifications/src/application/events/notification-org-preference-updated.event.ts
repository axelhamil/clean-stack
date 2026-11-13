import { EventTypes, type NotificationOrgPreferenceUpdatedPayload } from "@packages/events";
import type { z } from "zod";

export function notificationOrgPreferenceUpdatedEvent(
  payload: z.infer<typeof NotificationOrgPreferenceUpdatedPayload>,
) {
  return {
    type: EventTypes.NOTIFICATION_ORG_PREFERENCE_UPDATED,
    aggregateType: "notification_preference",
    aggregateId: payload.organizationId,
    payload,
  };
}
