import type { ConsentCategory } from "@packages/cookie-consent";
import type { AppError, Option, Result } from "@packages/ddd-kit";

export type ConsentError = AppError<"CONSENT_PROVIDER_FAILURE">;

export interface ConsentRecord {
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

export interface IConsentRepository {
  insert(record: ConsentRecord): Promise<Result<void, ConsentError>>;
  findActiveBySubject(
    subjectId: string,
    policyVersion: string,
  ): Promise<Result<Option<ConsentRecord>, ConsentError>>;
  findActiveByUser(
    userId: string,
    policyVersion: string,
  ): Promise<Result<Option<ConsentRecord>, ConsentError>>;
  linkSubjectToUser(subjectId: string, userId: string): Promise<Result<string[], ConsentError>>;
}
