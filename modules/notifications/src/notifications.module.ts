import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type {
  NotificationSettings,
  StaffAudienceSettings,
} from "./application/config/notification-settings";
import type { INotificationStore } from "./application/ports/repositories/notification.port";
import type { INotificationDigestStore } from "./application/ports/repositories/notification-digest.port";
import type { INotificationFanoutRepository } from "./application/ports/repositories/notification-fanout.port";
import type { IStaffRecipientsReader } from "./application/ports/services/staff-recipients.port";
import type { IGetUnreadCountQuery } from "./application/queries/get-unread-count.query";
import type { IListNotificationsQuery } from "./application/queries/list-notifications.query";
import type { IListPreferencesQuery } from "./application/queries/list-preferences.query";
import type { IOpenNotificationStreamQuery } from "./application/queries/open-notification-stream.query";
import { FanOutNotificationUseCase } from "./application/usecases/fan-out-notification/fan-out-notification.usecase";
import { FlushNotificationDigestUseCase } from "./application/usecases/flush-notification-digest/flush-notification-digest.usecase";
import { MarkAllNotificationsReadUseCase } from "./application/usecases/mark-all-notifications-read/mark-all-notifications-read.usecase";
import { MarkNotificationsReadUseCase } from "./application/usecases/mark-notifications-read/mark-notifications-read.usecase";
import { UpdateOrgPreferenceUseCase } from "./application/usecases/update-org-preference/update-org-preference.usecase";
import { UpdatePreferenceUseCase } from "./application/usecases/update-preference/update-preference.usecase";
import { NotificationFanoutSubscriber } from "./infra/adapters/notification-fanout-subscriber.adapter";
import { NotificationStreamHub } from "./infra/adapters/notification-stream-hub.adapter";
import { DrizzleGetUnreadCountQuery } from "./infra/queries/get-unread-count.query";
import { DrizzleListNotificationsQuery } from "./infra/queries/list-notifications.query";
import { DrizzleListPreferencesQuery } from "./infra/queries/list-preferences.query";
import { HubOpenNotificationStreamQuery } from "./infra/queries/open-notification-stream.query";
import { DrizzleNotificationRepository } from "./infra/repos/drizzle/notification.repository";
import { DrizzleNotificationDigestRepository } from "./infra/repos/drizzle/notification-digest.repository";
import { DrizzleNotificationFanoutRepository } from "./infra/repos/drizzle/notification-fanout.repository";

export interface NotificationsPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  IStaffRecipientsReader: IStaffRecipientsReader;
  staffSettings: StaffAudienceSettings;
  notificationSettings: NotificationSettings;
}

export const notificationsModule = defineModule<NotificationsPrerequisites>()((b) =>
  b
    .add(
      "INotificationStore",
      (c): INotificationStore => new DrizzleNotificationRepository(c.IInstrumentation),
    )
    .add(
      "INotificationDigestStore",
      (c): INotificationDigestStore => new DrizzleNotificationDigestRepository(c.IInstrumentation),
    )
    .add(
      "INotificationFanoutRepository",
      (c): INotificationFanoutRepository =>
        new DrizzleNotificationFanoutRepository(c.IInstrumentation),
    )
    .add(
      "IListNotificationsQuery",
      (c): IListNotificationsQuery => new DrizzleListNotificationsQuery(c.IInstrumentation),
    )
    .add(
      "IGetUnreadCountQuery",
      (c): IGetUnreadCountQuery => new DrizzleGetUnreadCountQuery(c.IInstrumentation),
    )
    .add(
      "IListPreferencesQuery",
      (c): IListPreferencesQuery => new DrizzleListPreferencesQuery(c.IInstrumentation),
    )
    .add(
      "NotificationStreamHub",
      (c) =>
        new NotificationStreamHub(
          c.ILogger,
          c.notificationSettings.databaseUrl,
          c.IInstrumentation,
        ),
    )
    .add(
      "IOpenNotificationStreamQuery",
      (c): IOpenNotificationStreamQuery =>
        new HubOpenNotificationStreamQuery(c.NotificationStreamHub),
    )
    .add(
      "MarkNotificationsReadUseCase",
      (c) =>
        new MarkNotificationsReadUseCase(
          c.INotificationStore,
          c.IOutboxRepository,
          c.ITransactionService,
        ),
    )
    .add(
      "MarkAllNotificationsReadUseCase",
      (c) =>
        new MarkAllNotificationsReadUseCase(
          c.INotificationStore,
          c.IOutboxRepository,
          c.ITransactionService,
        ),
    )
    .add(
      "UpdatePreferenceUseCase",
      (c) =>
        new UpdatePreferenceUseCase(
          c.INotificationStore,
          c.IOutboxRepository,
          c.ITransactionService,
        ),
    )
    .add(
      "UpdateOrgPreferenceUseCase",
      (c) =>
        new UpdateOrgPreferenceUseCase(
          c.INotificationStore,
          c.IOutboxRepository,
          c.ITransactionService,
        ),
    )
    .add(
      "FanOutNotificationUseCase",
      (c) =>
        new FanOutNotificationUseCase(
          c.INotificationFanoutRepository,
          c.IStaffRecipientsReader,
          c.ITransactionService,
          { digestHourUtc: c.notificationSettings.digestHourUtc, staff: c.staffSettings },
        ),
    )
    .add(
      "FlushNotificationDigestUseCase",
      (c) =>
        new FlushNotificationDigestUseCase(
          c.INotificationDigestStore,
          c.IEmailService,
          c.ITransactionService,
          c.IInstrumentation,
          c.ILogger,
        ),
    )
    .add(
      "NotificationFanoutSubscriber",
      (c) => new NotificationFanoutSubscriber(c.FanOutNotificationUseCase, c.IInstrumentation),
    ),
);
