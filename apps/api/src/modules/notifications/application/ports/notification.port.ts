import type { Option, Result } from "@packages/ddd-kit";

export type NotificationChannel = "in_app" | "email";
export type NotificationFrequency = "immediate" | "hourly" | "daily";
export type PreferenceScope = "user" | "org";

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
  | { code: "NOTIFICATION_READ_FAILED"; message: string }
  | { code: "NOTIFICATION_WRITE_FAILED"; message: string };

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
