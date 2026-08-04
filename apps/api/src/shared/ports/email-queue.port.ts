import type { Option, Result } from "@packages/ddd-kit";
import type { ITransaction } from "../transaction";

export type EmailMessageKind = "template" | "raw";
export type EmailMessageStatus = "pending" | "sent" | "failed";

export interface EmailMessageInsert {
  kind: EmailMessageKind;
  template: Option<string>;
  toAddress: string;
  subject: string;
  payload: unknown;
  idempotencyKey: Option<string>;
}

export interface EmailMessageRecord {
  id: string;
  kind: EmailMessageKind;
  template: Option<string>;
  toAddress: string;
  subject: string;
  payload: unknown;
  status: EmailMessageStatus;
  attempts: number;
  nextAttemptAt: Option<Date>;
  lastError: Option<string>;
  idempotencyKey: Option<string>;
  createdAt: Date;
}

export type EmailQueueError = { code: "EMAIL_QUEUE_WRITE_FAILED"; message: string };

export interface IEmailQueue {
  enqueue(rows: EmailMessageInsert[], tx?: ITransaction): Promise<Result<void, EmailQueueError>>;
  claimPending(
    limit: number,
    claimUntil: Date,
    tx: ITransaction,
  ): Promise<Result<EmailMessageRecord[], EmailQueueError>>;
  markSent(
    ids: string[],
    sentAt: Date,
    providerMessageIds: Record<string, string>,
    tx: ITransaction,
  ): Promise<Result<void, EmailQueueError>>;
  markFailed(
    id: string,
    error: string,
    nextAttemptAt: Option<Date>,
    tx: ITransaction,
  ): Promise<Result<void, EmailQueueError>>;
}
