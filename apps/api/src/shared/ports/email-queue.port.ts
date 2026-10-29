import type { Option, Result } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";

export type EmailMessageKind = "template" | "raw";
export type EmailMessageStatus = "pending" | "sent" | "failed" | "dead";

export interface EmailMessageInsert {
  kind: EmailMessageKind;
  template: Option<string>;
  toAddress: string;
  subject: string;
  locale: Locale;
  payload: unknown;
  idempotencyKey: Option<string>;
}

export interface EmailMessageRecord {
  id: string;
  kind: EmailMessageKind;
  template: Option<string>;
  toAddress: string;
  subject: string;
  locale: Option<Locale>;
  payload: unknown;
  status: EmailMessageStatus;
  attempts: number;
  nextAttemptAt: Option<Date>;
  lastError: Option<string>;
  idempotencyKey: Option<string>;
  createdAt: Date;
}

export type EmailLease = Pick<EmailMessageRecord, "id" | "attempts">;

export interface EmailClaimRequest {
  limit: number;
  leaseSeconds: number;
  deadReplayWindowHours: number;
}

export type EmailFailure =
  | { lastError: string; status: "failed" }
  | { lastError: string; status: "pending" | "dead"; retryAfterSeconds: number };

export type EmailQueueError = { code: "EMAIL_QUEUE_WRITE_FAILED"; message: string };

export interface IEmailQueue {
  enqueue(rows: EmailMessageInsert[]): Promise<Result<{ written: number }, EmailQueueError>>;
  claim(request: EmailClaimRequest): Promise<Result<EmailMessageRecord[], EmailQueueError>>;
  markSent(
    leases: EmailLease[],
    providerMessageIds: Record<string, string>,
  ): Promise<Result<EmailLease[], EmailQueueError>>;
  markFailed(lease: EmailLease, failure: EmailFailure): Promise<Result<boolean, EmailQueueError>>;
  release(leases: EmailLease[]): Promise<Result<number, EmailQueueError>>;
}
