import { publicNotificationPayload } from "@packages/events";
import type { NotificationRecord } from "../../../../application/ports/repositories/notification.port";
import type { NotificationPage } from "../../../../application/queries/list-notifications.query";

function toNotificationJson(record: NotificationRecord) {
  return {
    ...record,
    organizationId: record.organizationId.toNull(),
    groupKey: record.groupKey.toNull(),
    readAt: record.readAt.toNull(),
    payload: publicNotificationPayload(record.eventType, record.payload),
  };
}

export function toNotificationPageJson(page: NotificationPage) {
  return {
    items: page.items.map(toNotificationJson),
    nextCursor: page.nextCursor.map((at) => at.toISOString()).toNull(),
  };
}
