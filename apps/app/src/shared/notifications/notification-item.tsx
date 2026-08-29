import { Badge } from "@packages/ui/components/ui/badge";
import {
  ListRow,
  ListRowAction,
  ListRowContent,
  ListRowMeta,
} from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useFormatDate } from "../i18n/use-format-date";
import type { NotificationGroup } from "./group-notifications";
import { labelOf } from "./notification-labels";

interface NotificationItemProps {
  group: NotificationGroup;
  onRead: (ids: string[]) => void;
}

export function NotificationItem({ group, onRead }: NotificationItemProps) {
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
            {count > 1 && <TypographyMuted>and {count - 1} more</TypographyMuted>}
          </ListRowMeta>
        </button>
      </ListRowContent>
      <ListRowAction>
        <Badge variant={unread ? "default" : "secondary"}>{unread ? "New" : latest.category}</Badge>
      </ListRowAction>
    </ListRow>
  );
}
