import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import { logger } from "../../shared/logger";
import type { INotificationDigestStore } from "../../shared/ports/notification-digest.port";
import type {
  NotificationSettings,
  StaffAudienceSettings,
} from "./application/config/notification-settings";
import type { INotificationStore } from "./application/ports/notification.port";
import { DrizzleNotificationStore } from "./infrastructure/repositories/drizzle-notification.store";
import { DrizzleNotificationDigestStore } from "./infrastructure/repositories/drizzle-notification-digest.store";
import { NotificationFanoutSubscriber } from "./infrastructure/services/notification-fanout-subscriber";
import { NotificationStreamHub } from "./infrastructure/services/notification-stream-hub";

export interface NotificationsPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  staffSettings: StaffAudienceSettings;
  notificationSettings: NotificationSettings;
}

export const notificationsModule = defineModule<NotificationsPrerequisites>()((b) =>
  b
    .add(
      "INotificationStore",
      (c): INotificationStore => new DrizzleNotificationStore(c.IInstrumentation),
    )
    .add(
      "INotificationDigestStore",
      (c): INotificationDigestStore => new DrizzleNotificationDigestStore(c.IInstrumentation),
    )
    .add(
      "NotificationFanoutSubscriber",
      (c) =>
        new NotificationFanoutSubscriber(
          c.ITransactionService,
          c.IInstrumentation,
          c.notificationSettings.digestHourUtc,
          c.staffSettings,
        ),
    )
    .add(
      "NotificationStreamHub",
      (c) =>
        new NotificationStreamHub(logger, c.notificationSettings.databaseUrl, c.IInstrumentation),
    ),
);
