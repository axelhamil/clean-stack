import type { AppError, Result } from "@packages/ddd-kit";
import type { QuotaError } from "../repositories/quota-usage.port";

export type QuotaCountError = QuotaError | AppError<"QUOTA_RESOURCE_NOT_FOUND">;

export interface IQuotaCounter {
  count(organizationId: string, resource: string): Promise<Result<number, QuotaCountError>>;
}
