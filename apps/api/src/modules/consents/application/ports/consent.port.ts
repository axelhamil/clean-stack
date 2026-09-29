import type { ConsentCategory } from "@packages/cookie-consent";
import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ITransaction } from "../../../../shared/transaction";

export type ConsentError = AppError<"CONSENT_PROVIDER_FAILURE">;

export interface ConsentRecordRow {
  id: string;
  subjectId: string;
  userId: Option<string>;
  categories: ConsentCategory[];
  policyVersion: string;
  grantedAt: Date;
  withdrawnAt: Option<Date>;
  expiresAt: Date;
  ipAddress: Option<string>;
  userAgent: Option<string>;
}

export interface IConsentStore {
  insert(row: ConsentRecordRow, tx?: ITransaction): Promise<Result<void, ConsentError>>;
  findActiveBySubject(
    subjectId: string,
    policyVersion: string,
    tx?: ITransaction,
  ): Promise<Result<Option<ConsentRecordRow>, ConsentError>>;
  findActiveByUser(
    userId: string,
    policyVersion: string,
    tx?: ITransaction,
  ): Promise<Result<Option<ConsentRecordRow>, ConsentError>>;
  /** Resolves to the ids of the records it attached, empty when none was orphaned. */
  linkSubjectToUser(
    subjectId: string,
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<string[], ConsentError>>;
}
