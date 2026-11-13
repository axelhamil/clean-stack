import { Option } from "@packages/ddd-kit";
import { POLICY_TYPES, POLICY_VERSIONS, type PolicyType } from "@packages/policies";

export interface PolicyTypeStatus {
  current: boolean;
  acceptedVersion: Option<string>;
}

export type PolicyStatus = Record<PolicyType, PolicyTypeStatus>;

export type AcceptedVersions = Partial<Record<PolicyType, string>>;

function typeStatus(accepted: AcceptedVersions, type: PolicyType): PolicyTypeStatus {
  const acceptedVersion = Option.fromNullable(accepted[type]);

  return {
    current: acceptedVersion.map((version) => version === POLICY_VERSIONS[type]).unwrapOr(false),
    acceptedVersion,
  };
}

export function policyStatusFrom(accepted: AcceptedVersions): PolicyStatus {
  return {
    privacy: typeStatus(accepted, "privacy"),
    terms: typeStatus(accepted, "terms"),
  };
}

export function staleTypesOf(status: PolicyStatus): PolicyType[] {
  return POLICY_TYPES.filter((type) => !status[type].current);
}
