import type { Option } from "@packages/ddd-kit";
import type { NotificationFanoutError } from "../../ports/repositories/notification-fanout.port";
import type { StaffRecipientsError } from "../../ports/services/staff-recipients.port";

export interface FanOutNotificationInput {
  eventId: string;
  eventType: string;
  aggregateId: string;
  organizationId: Option<string>;
  payload: unknown;
  occurredAt: Date;
}

export type FanOutNotificationError = NotificationFanoutError | StaffRecipientsError;
