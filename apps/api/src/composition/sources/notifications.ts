import type { IStaffRecipientsReader } from "@modules/notifications/ports/staff-recipients";
import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import { StaffRecipientsQuery } from "../../queries/staff-recipients.query";

export interface NotificationsSourcesPrerequisites {
  IInstrumentation: IInstrumentation;
}

export const notificationsSources = defineModule<NotificationsSourcesPrerequisites>()((b) =>
  b.add(
    "IStaffRecipientsReader",
    (c): IStaffRecipientsReader => new StaffRecipientsQuery(c.IInstrumentation),
  ),
);
