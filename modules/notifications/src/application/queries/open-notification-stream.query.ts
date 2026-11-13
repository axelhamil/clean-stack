import type { AppError, IQuery } from "@packages/ddd-kit";

export const MAX_STREAMS_PER_USER = 5;

export type NotificationStreamRequest = {
  userId: string;
};

export interface NotificationStream {
  subscribe(onSignal: () => void): () => void;
}

export type NotificationStreamError = AppError<"NOTIFICATION_STREAM_RATE_LIMITED">;

export type IOpenNotificationStreamQuery = IQuery<
  NotificationStreamRequest,
  NotificationStream,
  NotificationStreamError
>;
