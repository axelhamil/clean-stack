import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ITransaction } from "../../../../shared/transaction";

export type BillingError = AppError<"BILLING_PROVIDER_FAILURE">;

export interface SubscriptionRow {
  tier: string;
  status: string;
}

export interface ISubscriptionReadStore {
  findActiveByReference(
    referenceId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<SubscriptionRow>, BillingError>>;
  findCustomerIdByReference(
    referenceId: string,
    tx?: ITransaction,
  ): Promise<Result<Option<string>, BillingError>>;
}
