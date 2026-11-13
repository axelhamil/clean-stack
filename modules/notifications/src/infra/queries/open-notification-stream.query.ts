import { Result } from "@packages/ddd-kit";
import type { INotificationStreamHub } from "../../application/ports/services/notification-stream-hub.port";
import {
  type IOpenNotificationStreamQuery,
  MAX_STREAMS_PER_USER,
  type NotificationStream,
  type NotificationStreamError,
  type NotificationStreamRequest,
} from "../../application/queries/open-notification-stream.query";

export class HubOpenNotificationStreamQuery implements IOpenNotificationStreamQuery {
  constructor(private readonly hub: INotificationStreamHub) {}

  async execute(
    request: NotificationStreamRequest,
  ): Promise<Result<NotificationStream, NotificationStreamError>> {
    const { userId } = request;

    if (this.hub.subscriberCount(userId) >= MAX_STREAMS_PER_USER) {
      return Result.fail({
        code: "NOTIFICATION_STREAM_RATE_LIMITED",
        message: "Too many notification streams are open for this user.",
      });
    }

    return Result.ok({ subscribe: (onSignal) => this.hub.subscribe(userId, onSignal) });
  }
}
