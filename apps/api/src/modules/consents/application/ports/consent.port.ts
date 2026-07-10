import type { ConsentCategory } from "@packages/cookie-consent";
import type { AppError, Result } from "@packages/ddd-kit";
import type { ITransaction } from "../../../../shared/transaction";

export type ConsentError = AppError<"CONSENT_PROVIDER_FAILURE">;

export interface ConsentRecordRow {
  id: string;
  subjectId: string;
  userId?: string;
  categories: ConsentCategory[];
  policyVersion: string;
  grantedAt: Date;
  withdrawnAt?: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface IConsentStore {
  insert(row: ConsentRecordRow, tx?: ITransaction): Promise<Result<void, ConsentError>>;
  findActiveBySubject(
    subjectId: string,
    policyVersion: string,
    tx?: ITransaction,
  ): Promise<Result<ConsentRecordRow | null, ConsentError>>;
  findActiveByUser(
    userId: string,
    policyVersion: string,
    tx?: ITransaction,
  ): Promise<Result<ConsentRecordRow | null, ConsentError>>;
  linkSubjectToUser(
    subjectId: string,
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<void, ConsentError>>;
}
