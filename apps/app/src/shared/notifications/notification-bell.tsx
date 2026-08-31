import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@packages/ui/components/ui/popover";
import { ScrollArea } from "@packages/ui/components/ui/scroll-area";
import { Separator } from "@packages/ui/components/ui/separator";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  markAllReadMutationOptions,
  markReadMutationOptions,
} from "../api/mutations/notifications";
import { notificationsQueryOptions, unreadCountQueryOptions } from "../api/queries/notifications";
import { groupNotifications } from "./group-notifications";
import {
  applyRead,
  type NotificationReadMessage,
  notificationReadChannel,
} from "./notification-broadcast";
import { NotificationItem } from "./notification-item";
import { badgeLabel, unreadLabel } from "./notification-labels";
import { useNotificationStream } from "./use-notification-stream";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { connected } = useNotificationStream();

  const { data: unread } = useQuery({
    ...unreadCountQueryOptions,
    refetchInterval: connected ? false : POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const { data: list } = useQuery({ ...notificationsQueryOptions(), enabled: open });

  const count = unread?.count ?? 0;
  const groups = useMemo(() => groupNotifications(list?.items ?? []), [list]);

  useEffect(
    () =>
      notificationReadChannel.subscribe((message) =>
        applyRead(queryClient, message, new Date().toISOString()),
      ),
    [queryClient],
  );

  const propagate = (message: NotificationReadMessage) => {
    applyRead(queryClient, message, new Date().toISOString());
    notificationReadChannel.post(message);
  };

  const markRead = useMutation({
    ...markReadMutationOptions,
    onSuccess: (_result, variables) => propagate({ ids: variables.ids }),
  });

  const markAllRead = useMutation({
    ...markAllReadMutationOptions,
    onSuccess: () => propagate({ all: true }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unreadLabel(t, count)}>
          <Bell />
          {count > 0 && (
            <Badge aria-hidden className="-top-1 -right-1 absolute">
              {badgeLabel(count)}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 p-3">
          <TypographySmall>{t("notifications.title")}</TypographySmall>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={count === 0 || markAllRead.isPending}
          >
            {t("notifications.markAllRead")}
          </Button>
        </div>

        <Separator />

        {groups.length === 0 ? (
          <TypographyMuted className="p-6 text-center">{t("notifications.empty")}</TypographyMuted>
        ) : (
          <ScrollArea className="h-96">
            <ul className="flex flex-col gap-2 p-3">
              {groups.map((group) => (
                <NotificationItem
                  key={group.key}
                  group={group}
                  onRead={(ids) => markRead.mutate({ ids })}
                />
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
