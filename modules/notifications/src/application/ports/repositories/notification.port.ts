import type { AppError, Option, Result } from "@packages/ddd-kit";
import type {
  NotificationChannel,
  NotificationFrequency,
  NotificationPreferenceScope,
} from "@packages/events";

export type { NotificationChannel, NotificationFrequency };
export type PreferenceScope = NotificationPreferenceScope;

export type NotificationRecord = {
  id: string;
  userId: string;
  organizationId: Option<string>;
  category: string;
  eventType: string;
  groupKey: Option<string>;
  payload: unknown;
  readAt: Option<Date>;
  createdAt: Date;
};

export type PreferenceRecord = {
  scope: PreferenceScope;
  scopeId: string;
  category: string;
  channel: NotificationChannel;
  enabled: boolean;
  frequency: NotificationFrequency;
  locked: boolean;
};

export type NotificationError = AppError<
  "NOTIFICATION_PROVIDER_FAILURE" | "NOTIFICATION_WRITE_PROVIDER_FAILURE"
>;

export interface INotificationStore {
  markRead(userId: string, ids: string[], now: Date): Promise<Result<string[], NotificationError>>;
  markAllRead(userId: string, now: Date): Promise<Result<string[], NotificationError>>;
  upsertPreference(preference: PreferenceRecord): Promise<Result<void, NotificationError>>;
}
