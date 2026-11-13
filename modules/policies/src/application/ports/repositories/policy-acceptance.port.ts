import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { PolicyType } from "@packages/policies";

export type PolicyError = AppError<"POLICY_ACCEPTANCE_PROVIDER_FAILURE">;

export interface PolicyAcceptanceRecord {
  id: string;
  userId: string;
  policyType: PolicyType;
  policyVersion: string;
  ipAddress: Option<string>;
}

export interface IPolicyAcceptanceRepository {
  insert(row: PolicyAcceptanceRecord): Promise<Result<void, PolicyError>>;
}
