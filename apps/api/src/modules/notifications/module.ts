import { defineModule } from "inwire";
import type { INotificationStore } from "./application/ports/notification.port";
import { NotificationPreferenceService } from "./application/services/notification-preference.service";
import { DrizzleNotificationStore } from "./infrastructure/repositories/drizzle-notification.store";

declare module "inwire" {
  interface AppDeps {
    INotificationStore: INotificationStore;
    NotificationPreferenceService: NotificationPreferenceService;
  }
}

export const notificationsModule = defineModule()((b) =>
  b
    .add(
      "INotificationStore",
      (c): INotificationStore => new DrizzleNotificationStore(c.IInstrumentation),
    )
    .add(
      "NotificationPreferenceService",
      (c) => new NotificationPreferenceService(c.INotificationStore),
    ),
);
