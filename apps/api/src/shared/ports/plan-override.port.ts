import type { AppError, Option, Result } from "@packages/ddd-kit";

export type PlanOverrideStoreError = AppError<"PLAN_OVERRIDE_PROVIDER_FAILURE">;

export interface ActivePlanOverride {
  id: string;
  organizationId: string;
  tier: string;
  expiresAt: Date;
  note: string;
  createdAt: Date;
}

export interface NewPlanOverride {
  id: string;
  organizationId: string;
  tier: string;
  expiresAt: Date;
  note: string;
  createdBy: string;
}

export interface IPlanOverrideStore {
  findActive(
    organizationId: string,
  ): Promise<Result<Option<ActivePlanOverride>, PlanOverrideStoreError>>;
  closeOpen(organizationId: string): Promise<Result<Option<string>, PlanOverrideStoreError>>;
  insert(row: NewPlanOverride): Promise<Result<boolean, PlanOverrideStoreError>>;
  revokeActive(
    organizationId: string,
  ): Promise<Result<Option<{ id: string; tier: string }>, PlanOverrideStoreError>>;
}

export type IPlanOverrideReader = Pick<IPlanOverrideStore, "findActive">;
