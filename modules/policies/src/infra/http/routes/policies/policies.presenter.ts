import type {
  PolicyStatus,
  PolicyTypeStatus,
} from "../../../../application/services/policy-status.service";

function presentTypeStatus(status: PolicyTypeStatus) {
  return { current: status.current, acceptedVersion: status.acceptedVersion.toNull() };
}

export function presentPolicyStatus(status: PolicyStatus) {
  return {
    privacy: presentTypeStatus(status.privacy),
    terms: presentTypeStatus(status.terms),
  };
}
