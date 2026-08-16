import type { Option, Result } from "@packages/ddd-kit";
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

export type PreferenceInput = PreferenceRecord;

export type NotificationError =
  | { code: "NOTIFICATION_PROVIDER_FAILURE"; message: string }
  | { code: "NOTIFICATION_WRITE_PROVIDER_FAILURE"; message: string };

export interface INotificationStore {
  list(
    userId: string,
    cursor: Option<string>,
    limit: number,
  ): Promise<Result<NotificationRecord[], NotificationError>>;
  unreadCount(userId: string): Promise<Result<number, NotificationError>>;
  markRead(userId: string, ids: string[], now: Date): Promise<Result<void, NotificationError>>;
  markAllRead(userId: string, now: Date): Promise<Result<void, NotificationError>>;
  listPreferences(
    scope: PreferenceScope,
    scopeId: string,
  ): Promise<Result<PreferenceRecord[], NotificationError>>;
  upsertPreference(input: PreferenceInput): Promise<Result<void, NotificationError>>;
}
