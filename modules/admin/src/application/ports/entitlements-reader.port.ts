import type { AppError, Result } from "@packages/ddd-kit";
import type { PlanOverrideStoreError } from "./plan-override.port";

export type EntitlementsReadError = AppError<"BILLING_PROVIDER_FAILURE"> | PlanOverrideStoreError;

export interface IEntitlementsReader {
  readEntitlements(
    organizationId: string,
  ): Promise<Result<{ tier: string }, EntitlementsReadError>>;
}
