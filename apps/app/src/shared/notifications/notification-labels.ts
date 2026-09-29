import {
  descriptionFor,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "@packages/events";
import type { TFunction } from "i18next";
import type { Notification } from "../api/queries/notifications";

const BADGE_CEILING = 9;

// Exported so the mapping itself (not just "every variant is present") is
// asserted in tests: `satisfies Record<NotificationCategory, string>` proves
// coverage but not correctness, e.g. it would happily accept `org` mapped to
// the "security" key. Shared by the inbox item and the preference matrix,
// which both label the same `NotificationCategory` union.
export const CATEGORY_KEYS = {
  security: "notifications.categories.security",
  org: "notifications.categories.org",
  billing: "notifications.categories.billing",
  activity: "notifications.categories.activity",
} as const satisfies Record<NotificationCategory, string>;

const UNKNOWN_CATEGORY_KEY = "notifications.categories.unknown";

type CategoryKey = (typeof CATEGORY_KEYS)[NotificationCategory] | typeof UNKNOWN_CATEGORY_KEY;

// A notification's `category` arrives widened to `string` by Hono's response
// inference, and the `GET /notifications` read path has no runtime validation
// (the `z.enum(NOTIFICATION_CATEGORIES)` schema only guards the preference
// PUT bodies). A guard, not a cast, is what proves the value belongs to the
// union here.
function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Resolves a wire-typed category to its catalog key, falling back when the value
 * is not one this build knows. Kept out of the JSX so the fallback branch is
 * reachable from a test: an untested fallback has never been shown to work.
 */
export function categoryKeyFor(category: string): CategoryKey {
  return isNotificationCategory(category) ? CATEGORY_KEYS[category] : UNKNOWN_CATEGORY_KEY;
}

function humanizeEventType(eventType: string): string {
  const words = eventType.replaceAll(".", " ").replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelOf(notification: Notification): string {
  return descriptionFor(notification.eventType) || humanizeEventType(notification.eventType);
}

// Takes the caller's own `t` rather than calling `useTranslation` itself: this
// is a plain helper, not a component or a hook, so it cannot own a translation
// subscription (shared/CLAUDE.md:37): the re-render on locale change comes
// from the component's own `useTranslation` call instead.
//
// Zero unread gets its own key (`unreadNone`) rather than falling through to
// the `_one`/`_other` plural pair: i18next has no `_zero` category selectable
// from either locale's `Intl.PluralRules`, but that only forbids the
// mechanism: it says nothing about the wording. Branching explicitly keeps
// "Notifications, none unread" / "Notifications, aucune non lue" instead of
// degrading to "Notifications, 0 unread".
export function unreadLabel(t: TFunction<"common">, count: number): string {
  if (count === 0) return t("notifications.unreadNone");
  return t("notifications.unreadLabel", { count });
}

export function badgeLabel(count: number): string {
  return count > BADGE_CEILING ? `${BADGE_CEILING}+` : String(count);
}
