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

export interface IPolicyAcceptanceStore {
  insert(row: PolicyAcceptanceRecord): Promise<Result<void, PolicyError>>;
  findLatestVersions(
    userId: string,
  ): Promise<Result<Partial<Record<PolicyType, string>>, PolicyError>>;
}
