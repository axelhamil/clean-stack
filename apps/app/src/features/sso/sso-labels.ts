export type SsoProviderType = "oidc" | "saml";

const SSO_PROVIDER_TYPES: readonly SsoProviderType[] = ["oidc", "saml"];

export function isSsoProviderType(value: string): value is SsoProviderType {
  return (SSO_PROVIDER_TYPES as readonly string[]).includes(value);
}

// `SsoProviderSummary.type` (api/sso.queries.ts) arrives widened to `string`
// off the wire — the guard above is what keeps an unrecognized future value
// from reaching this lookup unchecked, with the raw code as the fallback for
// anything it doesn't recognize.
//
// `satisfies Record<SsoProviderType, string>` only proves every type has AN
// entry — it cannot prove each one points at the RIGHT one, so
// `__tests__/sso-labels.test.ts` asserts the mapping directly. The same two
// keys back both the registration Tabs triggers (provider-card.tsx) and the
// interpolated "{{type}} provider for {{domain}}" line — one source for the
// same concept (see the `ALLOWED_IDENTICAL` comment in the parity test:
// OIDC/SAML are protocol acronyms, identical in both locales).
export const SSO_PROVIDER_TYPE_KEYS = {
  oidc: "sso.providerCard.type.oidc",
  saml: "sso.providerCard.type.saml",
} as const satisfies Record<SsoProviderType, string>;
