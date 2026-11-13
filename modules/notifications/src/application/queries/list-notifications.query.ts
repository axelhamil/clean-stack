import type { IQuery, Option } from "@packages/ddd-kit";
import type {
  NotificationError,
  NotificationRecord,
} from "../ports/repositories/notification.port";

export type NotificationFeedRequest = {
  userId: string;
  cursor: Option<Date>;
  limit: number;
};

export type NotificationPage = {
  items: NotificationRecord[];
  nextCursor: Option<Date>;
};

export type IListNotificationsQuery = IQuery<
  NotificationFeedRequest,
  NotificationPage,
  NotificationError
>;
