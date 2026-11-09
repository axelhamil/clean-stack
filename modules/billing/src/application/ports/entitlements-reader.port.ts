import type { AppError, Result } from "@packages/ddd-kit";
import type { EntitlementsView } from "../../domain/entitlements";
import type { PlanOverrideStoreError } from "./plan-override.port";

export type EntitlementsReadError = AppError<"BILLING_PROVIDER_FAILURE"> | PlanOverrideStoreError;

export interface IEntitlementsReader {
  getEntitlements(organizationId: string): Promise<EntitlementsView>;
  readEntitlements(
    organizationId: string,
  ): Promise<Result<EntitlementsView, EntitlementsReadError>>;
}
