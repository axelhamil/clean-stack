import type { NotificationCategory } from "@packages/events";
import { Badge } from "@packages/ui/components/ui/badge";
import {
  ListRow,
  ListRowAction,
  ListRowContent,
  ListRowMeta,
} from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import { useFormatDate } from "../i18n/use-format-date";
import type { NotificationGroup } from "./group-notifications";
import { labelOf } from "./notification-labels";

interface NotificationItemProps {
  group: NotificationGroup;
  onRead: (ids: string[]) => void;
}

const CATEGORY_KEYS = {
  security: "notifications.categories.security",
  org: "notifications.categories.org",
  billing: "notifications.categories.billing",
  activity: "notifications.categories.activity",
} as const satisfies Record<NotificationCategory, string>;

export function NotificationItem({ group, onRead }: NotificationItemProps) {
  const { t } = useTranslation("common");
  const formatDate = useFormatDate();
  const { latest, count, unread } = group;

  return (
    <ListRow>
      <ListRowContent>
        <button
          type="button"
          onClick={() => unread && onRead(group.ids)}
          disabled={!unread}
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
          {unread
            ? t("notifications.newBadge")
            : // The wire type widens `category` to `string` (Hono response
              // inference), but the API validates it against
              // `z.enum(NOTIFICATION_CATEGORIES)` before it ever reaches this
              // response — the cast reflects a guarantee made server-side.
              t(CATEGORY_KEYS[latest.category as NotificationCategory])}
        </Badge>
      </ListRowAction>
    </ListRow>
  );
}
