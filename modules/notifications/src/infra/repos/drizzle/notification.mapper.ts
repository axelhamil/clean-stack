import { Option } from "@packages/ddd-kit";
import type * as notificationSchema from "../../../../schemas/notification";
import type {
  NotificationRecord,
  PreferenceRecord,
} from "../../../application/ports/repositories/notification.port";

export function toNotificationRecord(
  row: typeof notificationSchema.notification.$inferSelect,
): NotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: Option.fromNullable(row.organizationId),
    category: row.category,
    eventType: row.eventType,
    groupKey: Option.fromNullable(row.groupKey),
    payload: row.payload,
    readAt: Option.fromNullable(row.readAt),
    createdAt: row.createdAt,
  };
}

export function toPreferenceRecord(
  row: typeof notificationSchema.notificationPreference.$inferSelect,
): PreferenceRecord {
  return {
    scope: row.scope,
    scopeId: row.scopeId,
    category: row.category,
    channel: row.channel,
    enabled: row.enabled,
    frequency: row.frequency,
    locked: row.locked,
  };
}
