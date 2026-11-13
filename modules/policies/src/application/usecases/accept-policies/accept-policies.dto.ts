import type { Option } from "@packages/ddd-kit";
import type { PolicyType } from "@packages/policies";

export interface AcceptPoliciesInput {
  userId: string;
  types: Option<PolicyType[]>;
  ipAddress: Option<string>;
}

export interface AcceptPoliciesOutput {
  accepted: PolicyType[];
}
