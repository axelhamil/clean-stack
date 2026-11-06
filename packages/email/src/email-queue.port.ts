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
  batchKey: Option<string>;
  unsettledInBatch: Option<number>;
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
  assignBatch(
    leases: EmailLease[],
    batchKey: string,
  ): Promise<Result<EmailLease[], EmailQueueError>>;
  markFailed(
    leases: EmailLease[],
    failure: EmailFailure,
  ): Promise<Result<EmailLease[], EmailQueueError>>;
  release(leases: EmailLease[], delaySeconds?: number): Promise<Result<number, EmailQueueError>>;
}
