import type { AppError, Result } from "@packages/ddd-kit";

export type QuotaLockError =
  | AppError<"QUOTA_TRANSACTION_UNAVAILABLE">
  | AppError<"QUOTA_PROVIDER_FAILURE">;

export interface IQuotaLock {
  acquire(organizationId: string, resource: string): Promise<Result<void, QuotaLockError>>;
}
