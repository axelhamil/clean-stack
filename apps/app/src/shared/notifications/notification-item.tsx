import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@packages/events";
import { Badge } from "@packages/ui/components/ui/badge";
import {
  ListRow,
  ListRowAction,
  ListRowContent,
  ListRowMeta,
} from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import type { ImpersonationGuard } from "../auth/use-impersonation-guard";
import { useFormatDate } from "../i18n/use-format-date";
import type { NotificationGroup } from "./group-notifications";
import { labelOf } from "./notification-labels";

interface NotificationItemProps {
  group: NotificationGroup;
  onRead: (ids: string[]) => void;
  guard: ImpersonationGuard;
}

// Exported so the mapping itself — not just "every variant is present" — is
// asserted in tests: `satisfies Record<NotificationCategory, string>` proves
// coverage but not correctness, e.g. it would happily accept `org` mapped to
// the "security" key.
export const CATEGORY_KEYS = {
  security: "notifications.categories.security",
  org: "notifications.categories.org",
  billing: "notifications.categories.billing",
  activity: "notifications.categories.activity",
} as const satisfies Record<NotificationCategory, string>;

const UNKNOWN_CATEGORY_KEY = "notifications.categories.unknown";

/**
 * Resolves a wire-typed category to its catalog key, falling back when the value
 * is not one this build knows.
 *
 * Extracted from the JSX so the fallback branch is reachable from a test: an
 * untested fallback is a guard whose whole purpose — rendering something sensible
 * when the assumption breaks — has never been shown to work.
 */
export function categoryKeyFor(category: string): string {
  return isNotificationCategory(category) ? CATEGORY_KEYS[category] : UNKNOWN_CATEGORY_KEY;
}

// `latest.category`'s wire type is widened to `string` by Hono's response
// inference. The only real guarantee is a TS-level one: `NotificationConfig`
// (packages/events/src/notification-map.ts) types `category` as
// `NotificationCategory` at the point notifications are written — there is no
// runtime validation on the `GET /notifications` read path itself (the
// `z.enum(NOTIFICATION_CATEGORIES)` schema only guards the PUT
// preferences/org-preferences bodies). A guard, not a cast, is what actually
// proves the value belongs to the union at this call site — see the E.1b
// recipe's shape 3.
function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function NotificationItem({ group, onRead, guard }: NotificationItemProps) {
  const { t } = useTranslation("common");
  const formatDate = useFormatDate();
  const { latest, count, unread } = group;

  return (
    <ListRow>
      <ListRowContent>
        <button
          type="button"
          onClick={() => unread && onRead(group.ids)}
          disabled={!unread || guard.blocked}
          {...guard.describeProps(!unread)}
          className="flex flex-col items-start gap-1 text-left"
        >
          <TypographySmall>{labelOf(latest)}</TypographySmall>
          <ListRowMeta>
            <TypographyMuted>{formatDate(latest.createdAt)}</TypographyMuted>
            {count > 1 && (
              <TypographyMuted>{t("notifications.andMore", { count: count - 1 })}</TypographyMuted>
            )}
          </ListRowMeta>
        </button>
      </ListRowContent>
      <ListRowAction>
        <Badge variant={unread ? "default" : "secondary"}>
          {unread ? t("notifications.newBadge") : t(categoryKeyFor(latest.category) as never)}
        </Badge>
      </ListRowAction>
    </ListRow>
  );
}
