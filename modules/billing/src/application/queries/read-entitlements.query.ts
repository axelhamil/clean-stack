import type { AppError, IQuery } from "@packages/ddd-kit";
import type { PlanOverrideStoreError } from "../ports/repositories/plan-override.port";
import type { EntitlementsView } from "../services/entitlement-policy.service";
import type { EntitlementsInput } from "./get-entitlements.query";

export type EntitlementsReadError = AppError<"BILLING_PROVIDER_FAILURE"> | PlanOverrideStoreError;

export type IReadEntitlementsQuery = IQuery<
  EntitlementsInput,
  EntitlementsView,
  EntitlementsReadError
>;
