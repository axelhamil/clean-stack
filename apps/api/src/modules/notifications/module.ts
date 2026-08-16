import { defineModule } from "inwire";
import type { INotificationStore } from "./application/ports/notification.port";
import { DrizzleNotificationStore } from "./infrastructure/repositories/drizzle-notification.store";

declare module "inwire" {
  interface AppDeps {
    INotificationStore: INotificationStore;
  }
}

export const notificationsModule = defineModule()((b) =>
  b.add(
    "INotificationStore",
    (c): INotificationStore => new DrizzleNotificationStore(c.IInstrumentation),
  ),
);
