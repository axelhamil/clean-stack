import type { IQuery } from "@packages/ddd-kit";
import type { NotificationError } from "../ports/repositories/notification.port";

export type UnreadCountRequest = {
  userId: string;
};

export type IGetUnreadCountQuery = IQuery<UnreadCountRequest, number, NotificationError>;
