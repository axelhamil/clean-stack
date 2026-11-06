import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { INotificationStore } from "./application/ports/notification.port";
import { DrizzleNotificationStore } from "./infrastructure/repositories/drizzle-notification.store";

export interface NotificationsPrerequisites {
  IInstrumentation: IInstrumentation;
}

export const notificationsModule = defineModule<NotificationsPrerequisites>()((b) =>
  b.add(
    "INotificationStore",
    (c): INotificationStore => new DrizzleNotificationStore(c.IInstrumentation),
  ),
);
