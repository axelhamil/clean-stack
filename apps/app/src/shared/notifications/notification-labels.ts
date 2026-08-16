import { descriptionFor } from "@packages/events";
import type { Notification } from "../api/queries/notifications";

const BADGE_CEILING = 9;

function humanizeEventType(eventType: string): string {
  const words = eventType.replaceAll(".", " ").replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelOf(notification: Notification): string {
  return descriptionFor(notification.eventType) || humanizeEventType(notification.eventType);
}

export function unreadLabel(count: number): string {
  return count === 0 ? "Notifications, none unread" : `Notifications, ${count} unread`;
}

export function badgeLabel(count: number): string {
  return count > BADGE_CEILING ? `${BADGE_CEILING}+` : String(count);
}
