import type { AppError, Result } from "@packages/ddd-kit";

export type QuotaError = AppError<"QUOTA_PROVIDER_FAILURE">;

export type QuotaPeriod = { start: Date; end: Date };

export interface IQuotaUsageStore {
  increment(
    orgId: string,
    resource: string,
    by: number,
    period: QuotaPeriod,
  ): Promise<Result<number, QuotaError>>;
  current(
    orgId: string,
    resource: string,
    period: QuotaPeriod,
  ): Promise<Result<number, QuotaError>>;
  reset(orgId: string, resource: string, period: QuotaPeriod): Promise<Result<void, QuotaError>>;
}
