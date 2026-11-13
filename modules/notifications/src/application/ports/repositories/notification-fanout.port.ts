import type { OrgRole } from "@packages/access-control";
import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { NotificationCategory } from "@packages/events";

export type FanoutRecipients =
  | { kind: "user"; userId: string }
  | { kind: "org"; organizationId: string; roles: OrgRole[] | "all" }
  | { kind: "listed"; userIds: string[] };

export type EmailDueAt = {
  immediate: Date;
  hourly: Date;
  daily: Date;
};

export type NotificationFanout = {
  recipients: FanoutRecipients;
  organizationId: Option<string>;
  category: NotificationCategory;
  eventType: string;
  groupKey: Option<string>;
  dedupKey: string;
  payload: unknown;
  forced: boolean;
  emailDueAt: EmailDueAt;
};

export type NotificationFanoutError = AppError<"NOTIFICATION_FANOUT_PROVIDER_FAILURE">;

export interface INotificationFanoutRepository {
  fanOut(fanout: NotificationFanout): Promise<Result<void, NotificationFanoutError>>;
}
