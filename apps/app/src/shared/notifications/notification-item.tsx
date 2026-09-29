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
import { categoryKeyFor, labelOf } from "./notification-labels";

interface NotificationItemProps {
  group: NotificationGroup;
  onRead: (ids: string[]) => void;
  guard: ImpersonationGuard;
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
          {unread ? t("notifications.newBadge") : t(categoryKeyFor(latest.category))}
        </Badge>
      </ListRowAction>
    </ListRow>
  );
}
