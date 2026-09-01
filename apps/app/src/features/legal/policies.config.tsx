import {
  POLICY_CHANGELOG,
  POLICY_VERSIONS,
  type PolicyChangelogEntry,
  type PolicyType,
} from "@packages/policies";

// Non-prose metadata only. The rendered bodies live in `policies/en.tsx` and
// `policies/fr.tsx` (per-locale, R3); `policy-labels.ts` owns the translated
// title lookup. Neither belongs on this record: the body is chosen per
// locale at render time (`policies/index.ts`), and a hardcoded English title
// field would be a second, driftable source of truth next to the catalog.
export interface PolicyDoc {
  type: PolicyType;
  version: string;
  effectiveDate: string;
  summary: string;
}

const privacyChangelog = POLICY_CHANGELOG.privacy;
const termsChangelog = POLICY_CHANGELOG.terms;

export const POLICY_DOCS: Record<PolicyType, PolicyDoc> = {
  privacy: {
    type: "privacy",
    version: POLICY_VERSIONS.privacy,
    effectiveDate:
      privacyChangelog[privacyChangelog.length - 1]?.effectiveDate ?? POLICY_VERSIONS.privacy,
    summary: privacyChangelog[privacyChangelog.length - 1]?.summary ?? "",
  },
  terms: {
    type: "terms",
    version: POLICY_VERSIONS.terms,
    effectiveDate:
      termsChangelog[termsChangelog.length - 1]?.effectiveDate ?? POLICY_VERSIONS.terms,
    summary: termsChangelog[termsChangelog.length - 1]?.summary ?? "",
  },
};

export function getChangesSince(
  type: PolicyType,
  acceptedVersion: string | null,
): PolicyChangelogEntry[] {
  const entries = POLICY_CHANGELOG[type];
  if (!acceptedVersion) return [...entries];
  return entries.filter((e) => e.version > acceptedVersion);
}
