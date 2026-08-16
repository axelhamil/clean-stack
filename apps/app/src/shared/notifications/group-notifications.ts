import type { Notification } from "../api/queries/notifications";

export type NotificationGroup = {
  key: string;
  latest: Notification;
  count: number;
  unread: boolean;
  ids: string[];
};

export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const byKey = new Map<string, NotificationGroup>();

  for (const item of items) {
    const existing = item.groupKey ? byKey.get(item.groupKey) : undefined;

    if (existing) {
      existing.count += 1;
      existing.ids.push(item.id);
      existing.unread ||= item.readAt === null;
      continue;
    }

    const group: NotificationGroup = {
      key: item.groupKey ?? item.id,
      latest: item,
      count: 1,
      unread: item.readAt === null,
      ids: [item.id],
    };

    groups.push(group);
    if (item.groupKey) byKey.set(item.groupKey, group);
  }

  return groups;
}
