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
  samlCallback: "/sso/saml2/callback/:providerId",
  samlAcs: "/sso/saml2/sp/acs/:providerId",
  samlSlo: "/sso/saml2/sp/slo/:providerId",
  samlInitiateSlo: "/sso/saml2/logout/:providerId",
  spMetadata: "/sso/saml2/sp/metadata",
  requestDomainVerification: "/sso/request-domain-verification",
  verifyDomain: "/sso/verify-domain",
} as const;

export const SCIM_PATHS = {
  generateToken: "/scim/generate-token",
  listConnections: "/scim/list-provider-connections",
  getConnection: "/scim/get-provider-connection",
  deleteConnection: "/scim/delete-provider-connection",
  users: "/scim/v2/Users",
  user: "/scim/v2/Users/:userId",
  serviceProviderConfig: "/scim/v2/ServiceProviderConfig",
  schemas: "/scim/v2/Schemas",
  schema: "/scim/v2/Schemas/:schemaId",
  resourceTypes: "/scim/v2/ResourceTypes",
  resourceType: "/scim/v2/ResourceTypes/:resourceTypeId",
} as const;

/**
 * The SCIM bearer token is base64 of `token:providerId[:organizationId]` (the shape
 * @better-auth/scim issues via `generate-token`). SCIM endpoints authenticate with
 * this token — `ctx.context.session` is empty — so the provider id has to be read
 * back out of the `Authorization` header rather than the session.
 *
 * The decode is unauthenticated by construction — it reads whatever the caller
 * claims, not a verified identity. `scimProviderIdFromToken` stays safe to call
 * only where the caller doesn't act on the result (an audit-log annotation on a
 * request that already passed the plugin's own bearer check, e.g. `hooks.after`).
 * A `hooks.before` branch that resolves an actor or a billing decision from the
 * token — before the plugin's own `authMiddleware` has run — must use
 * `verifiedScimConnectionOwner` (`auth-queries.ts`) instead, which hashes the
 * decoded token and compares it against the stored SCIM connection before trusting
 * the provider id it names.
 */
export function scimTokenPartsFromHeader(
  headers: Headers | undefined,
): { token: string; providerId: string } | null {
  const raw = headers?.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  try {
    const [token, providerId] = atob(raw).split(":");
    return token && providerId ? { token, providerId } : null;
  } catch {
    return null;
  }
}

export function scimProviderIdFromToken(headers: Headers | undefined): string {
  return scimTokenPartsFromHeader(headers)?.providerId ?? "unknown";
}

/**
 * Detects a deactivation across both shapes SCIM clients send: Entra ID issues a
 * `PATCH` with an `Operations` array (`{ op: "replace", path: "active", value: false }`),
 * while a plain `PUT` (Okta and others) carries `active` at the top level. Missing
 * either shape silently drops that IdP's deactivations from the audit trail.
 */
export function isDeactivation(body: Record<string, unknown> | undefined): boolean {
  if (body?.active === false) return true;
  const operations = body?.Operations as Array<{ path?: string; value?: unknown }> | undefined;
  return operations?.some((op) => op.path === "active" && op.value === false) ?? false;
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
