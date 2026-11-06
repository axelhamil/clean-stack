import type { AppError, Option, Result } from "@packages/ddd-kit";

export type NotificationDigestError = AppError<"NOTIFICATION_DIGEST_PROVIDER_FAILURE">;

export type DueNotification = {
  id: string;
  userId: string;
  category: string;
  eventType: string;
  email: string;
  locale: Option<string>;
  payload: unknown;
  emailStillWanted: boolean;
};

export interface INotificationDigestStore {
  countDue(now: Date): Promise<Result<number, NotificationDigestError>>;
  beginFlush(lockKey: string): Promise<Result<boolean, NotificationDigestError>>;
  claimDue(now: Date, limit: number): Promise<Result<DueNotification[], NotificationDigestError>>;
  dropUnwanted(ids: string[]): Promise<Result<void, NotificationDigestError>>;
  markSent(ids: string[], sentAt: Date): Promise<Result<void, NotificationDigestError>>;
}
