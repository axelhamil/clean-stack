import type { Result } from "@packages/ddd-kit";
import type { ITransaction } from "../transaction";

export type EmailMessageKind = "template" | "raw";
export type EmailMessageStatus = "pending" | "sent" | "failed";

export interface EmailMessageInsert {
  kind: EmailMessageKind;
  template: string | null;
  toAddress: string;
  subject: string;
  payload: unknown;
  idempotencyKey: string | null;
}

export interface EmailMessageRecord {
  id: string;
  kind: EmailMessageKind;
  template: string | null;
  toAddress: string;
  subject: string;
  payload: unknown;
  status: EmailMessageStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  idempotencyKey: string | null;
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
    nextAttemptAt: Date | null,
    tx: ITransaction,
  ): Promise<Result<void, EmailQueueError>>;
}
