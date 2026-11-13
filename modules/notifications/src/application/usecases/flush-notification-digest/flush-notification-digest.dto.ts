import type { EmailError } from "@packages/email/email.port";
import type { NotificationDigestError } from "../../ports/repositories/notification-digest.port";

export interface FlushNotificationDigestInput {
  batchSize: number;
  dryRun: boolean;
}

export interface FlushNotificationDigestOutput {
  dryRun: boolean;
  skipped?: boolean;
  eligible?: number;
  flushed: number;
  notifications: number;
}

export type FlushNotificationDigestError = NotificationDigestError | EmailError;
