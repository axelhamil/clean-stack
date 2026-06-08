export const POLICY_TYPES = ["privacy", "terms"] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

export const POLICY_VERSIONS: Record<PolicyType, string> = {
  privacy: "2026-01-15",
  terms: "2026-01-15",
};
