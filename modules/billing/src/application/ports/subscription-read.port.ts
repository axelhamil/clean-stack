import type { AppError, Option, Result } from "@packages/ddd-kit";

export type BillingError = AppError<"BILLING_PROVIDER_FAILURE">;

export interface SubscriptionRow {
  tier: string;
  status: string;
}

export interface ISubscriptionReadStore {
  findActiveByReference(
    referenceId: string,
  ): Promise<Result<Option<SubscriptionRow>, BillingError>>;
  findCustomerIdByReference(referenceId: string): Promise<Result<Option<string>, BillingError>>;
}
