import type { PolicyType } from "./versions";

export interface PolicyChangelogEntry {
  version: string;
  effectiveDate: string;
  summary: string;
}

export const POLICY_CHANGELOG: Record<PolicyType, readonly PolicyChangelogEntry[]> = {
  privacy: [
    {
      version: "2026-01-15",
      effectiveDate: "2026-01-15",
      summary: "Initial privacy policy.",
    },
  ],
  terms: [
    {
      version: "2026-01-15",
      effectiveDate: "2026-01-15",
      summary: "Initial terms of service.",
    },
  ],
};
