import type { PolicyType } from "@packages/policies";

// `POLICY_DOCS` (`policies.config.tsx`) used to carry each doc's title as a
// hardcoded English string. Now that titles translate, this is the single
// source of truth for the catalog key — every call site that used to read
// `doc.title` directly (the doc view's `<h1>`, the acceptance screen's card
// title and its "read the full X" link) reads through here instead.
export const POLICY_TITLE_KEYS = {
  privacy: "legal.policies.privacyTitle",
  terms: "legal.policies.termsTitle",
} as const satisfies Record<PolicyType, string>;

// The acceptance screen derives its stale-policy list from the API's response
// keys, which arrive as bare `string` — a boundary the response's own type
// doesn't narrow. Reaching `POLICY_TITLE_KEYS` through an `as`-cast there
// would compile and keep compiling the day the API starts returning a policy
// type the front doesn't know about; this guard is what actually proves it.
export function isPolicyType(value: string): value is PolicyType {
  return value in POLICY_TITLE_KEYS;
}

// The API returns the policy type as a bare string, so an unknown type has to
// render as itself rather than as a missing key: the register can gain a policy
// before the catalog does, and a raw slug is a better row than a blank one.
export function policyLabelFor(
  type: string,
  translate: (key: (typeof POLICY_TITLE_KEYS)[PolicyType]) => string,
): string {
  return isPolicyType(type) ? translate(POLICY_TITLE_KEYS[type]) : type;
}
