// Observed by dumping `auth.api` with both plugins mounted (Task 1, J0). The two
// domainVerification paths are absent from that dump (only registered once Task 4 sets
// `domainVerification.enabled`) and were instead confirmed by reading @better-auth/sso's
// route source (`routes/domain-verification.ts`).

export const SSO_PATHS = {
  register: "/sso/register",
  updateProvider: "/sso/update-provider",
  deleteProvider: "/sso/delete-provider",
  getProvider: "/sso/get-provider",
  listProviders: "/sso/providers",
  signIn: "/sign-in/sso",
  callback: "/sso/callback",
  callbackWithProvider: "/sso/callback/:providerId",
  samlAcs: "/sso/saml2/sp/acs/:providerId",
  samlSlo: "/sso/saml2/sp/slo/:providerId",
  samlInitiateSlo: "/sso/saml2/logout/:providerId",
  spMetadata: "/sso/saml2/sp/metadata",
  requestDomainVerification: "/sso/request-domain-verification",
  verifyDomain: "/sso/verify-domain",
} as const;

/**
 * The endpoints that finish an SSO sign-in (OIDC and SAML, with or without a provider
 * id in the path). Every branch that asks "did this request come back from the IdP?"
 * reads this one list, so adding a callback shape is a one-line change.
 */
const SSO_CALLBACK_PATHS: readonly string[] = [
  SSO_PATHS.callback,
  SSO_PATHS.callbackWithProvider,
  SSO_PATHS.samlAcs,
];

export function isSsoCallbackPath(path: string | undefined): boolean {
  return path !== undefined && SSO_CALLBACK_PATHS.includes(path);
}

export function isSamlCallbackPath(path: string): boolean {
  return path === SSO_PATHS.samlAcs;
}

export const SCIM_PATHS = {
  users: "/scim/v2/Users",
  user: "/scim/v2/Users/:userId",
} as const;

export type ScimUserChange = "created" | "updated" | "deactivated" | "deprovisioned";

/**
 * What a successful `/scim/v2/Users` write did to the user, read from the stored
 * state rather than from the request body: SCIM clients express a deactivation in
 * several shapes (Entra's `PATCH` operations, a top-level `active` on a `PUT`, a
 * filtered path), and only the stored before/after `active` flag is shape-proof.
 * A reactivation, like any other attribute change, is an update.
 */
export function scimUserChange(
  method: string,
  before: { active: boolean } | undefined,
  after: { active: boolean } | undefined,
): ScimUserChange | null {
  if (method === "POST") return "created";
  if (method === "DELETE") return "deprovisioned";
  if (method !== "PUT" && method !== "PATCH") return null;
  if (before?.active && after?.active === false) return "deactivated";
  return "updated";
}

/**
 * Lists the SCIM attributes touched by an update: PATCH operation paths when present,
 * otherwise every top-level key of a PUT body minus the `schemas` envelope.
 */
export function changedFieldsFrom(body: Record<string, unknown> | undefined): string[] {
  const operations = body?.Operations as Array<{ path?: string }> | undefined;
  if (operations) return operations.map((op) => op.path ?? "unknown");
  return Object.keys(body ?? {}).filter((k) => k !== "schemas");
}
