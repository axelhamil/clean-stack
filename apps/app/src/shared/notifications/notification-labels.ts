import { descriptionFor } from "@packages/events";
import type { TFunction } from "i18next";
import type { Notification } from "../api/queries/notifications";

const BADGE_CEILING = 9;

function humanizeEventType(eventType: string): string {
  const words = eventType.replaceAll(".", " ").replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelOf(notification: Notification): string {
  return descriptionFor(notification.eventType) || humanizeEventType(notification.eventType);
}

// Takes the caller's own `t` rather than calling `useTranslation` itself: this
// is a plain helper, not a component or a hook, so it cannot own a translation
// subscription (shared/CLAUDE.md:37) — the re-render on locale change comes
// from the component's own `useTranslation` call instead.
//
// Zero unread gets its own key (`unreadNone`) rather than falling through to
// the `_one`/`_other` plural pair: i18next has no `_zero` category selectable
// from either locale's `Intl.PluralRules`, but that only forbids the
// mechanism — it says nothing about the wording. Branching explicitly keeps
// "Notifications, none unread" / "Notifications, aucune non lue" instead of
// degrading to "Notifications, 0 unread".
export function unreadLabel(t: TFunction<"common">, count: number): string {
  if (count === 0) return t("notifications.unreadNone");
  return t("notifications.unreadLabel", { count });
}

export function badgeLabel(count: number): string {
  return count > BADGE_CEILING ? `${BADGE_CEILING}+` : String(count);
}
