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
