import {
  POLICY_CHANGELOG,
  POLICY_VERSIONS,
  type PolicyChangelogEntry,
  type PolicyType,
} from "@packages/policies";

// Non-prose metadata only. The rendered bodies live in `policies/en.tsx` and
// `policies/fr.tsx` (per-locale, R3); `policy-labels.ts` owns the translated
// title lookup. Neither belongs on this record: the body is chosen per
// locale at render time (`policies/bodies.ts`), and a hardcoded English title
// field would be a second, driftable source of truth next to the catalog.
export interface PolicyDoc {
  type: PolicyType;
  version: string;
  effectiveDate: string;
  summary: string;
}

function currentDoc(type: PolicyType): PolicyDoc {
  const version = POLICY_VERSIONS[type];
  const latest = POLICY_CHANGELOG[type].at(-1);

  return {
    type,
    version,
    effectiveDate: latest?.effectiveDate ?? version,
    summary: latest?.summary ?? "",
  };
}

export const POLICY_DOCS: Record<PolicyType, PolicyDoc> = {
  privacy: currentDoc("privacy"),
  terms: currentDoc("terms"),
};

export function getChangesSince(
  type: PolicyType,
  acceptedVersion: string | null,
): PolicyChangelogEntry[] {
  const entries = POLICY_CHANGELOG[type];
  if (!acceptedVersion) return [...entries];
  return entries.filter((e) => e.version > acceptedVersion);
}
