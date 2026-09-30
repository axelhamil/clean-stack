import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { PolicyType } from "@packages/policies";
import type { ITransaction } from "../../../../shared/transaction";

export type PolicyError = AppError<"POLICY_ACCEPTANCE_PROVIDER_FAILURE">;

export interface PolicyAcceptanceRecord {
  id: string;
  userId: string;
  policyType: PolicyType;
  policyVersion: string;
  ipAddress: Option<string>;
}

export interface IPolicyAcceptanceStore {
  insert(row: PolicyAcceptanceRecord, tx?: ITransaction): Promise<Result<void, PolicyError>>;
  findLatestVersions(
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<Partial<Record<PolicyType, string>>, PolicyError>>;
}
