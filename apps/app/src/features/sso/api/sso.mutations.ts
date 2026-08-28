import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";
import { authClient } from "../../../shared/auth/auth-client";
import { env } from "../../../shared/env";
import type { OidcProviderInput, SamlProviderInput } from "../sso.schema";

// Providers aren't given an id by the operator — the server just wants a stable
// string. Deriving it from the domain keeps re-registrations of the same domain
// idempotent instead of piling up rows against `providersLimit`.
function providerIdFromDomain(domain: string): string {
  return domain.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export const registerOidcProviderMutationOptions = mutationOptions({
  mutationKey: ["settings", "sso", "register", "oidc"] as const,
  mutationFn: async ({
    organizationId,
    values,
  }: {
    organizationId: string;
    values: OidcProviderInput;
  }) => {
    const providerId = providerIdFromDomain(values.domain);
    const { data, error } = await authClient.sso.register({
      providerId,
      issuer: values.issuer,
      domain: values.domain,
      organizationId,
      oidcConfig: { clientId: values.clientId, clientSecret: values.clientSecret },
    });
    if (error) throw new Error(error.message ?? "Failed to register the OIDC provider");
    return data;
  },
});

export const registerSamlProviderMutationOptions = mutationOptions({
  mutationKey: ["settings", "sso", "register", "saml"] as const,
  mutationFn: async ({
    organizationId,
    values,
  }: {
    organizationId: string;
    values: SamlProviderInput;
  }) => {
    const providerId = providerIdFromDomain(values.domain);
    // The server forces SHA-256 + signed assertions on every SAML registration
    // (D8 hardening in apps/api/src/auth.ts) — the client never sends
    // `signatureAlgorithm`, there is no weaker option to offer.
    const { data, error } = await authClient.sso.register({
      providerId,
      issuer: values.issuer,
      domain: values.domain,
      organizationId,
      samlConfig: {
        entryPoint: values.entryPoint,
        cert: values.cert,
        callbackUrl: `${env.VITE_API_URL}/api/auth/sso/saml2/sp/acs/${providerId}`,
        spMetadata: {},
      },
    });
    if (error) throw new Error(error.message ?? "Failed to register the SAML provider");
    return data;
  },
});

export const verifyDomainMutationOptions = mutationOptions({
  mutationKey: ["settings", "sso", "verify-domain"] as const,
  mutationFn: async (providerId: string) => {
    const { error } = await authClient.sso.verifyDomain({ providerId });
    if (error) throw new Error(error.message ?? "Domain verification failed");
  },
});

export const generateScimTokenMutationOptions = mutationOptions({
  mutationKey: ["settings", "sso", "generate-scim-token"] as const,
  mutationFn: async ({
    providerId,
    organizationId,
  }: {
    providerId: string;
    organizationId: string;
  }) => {
    const { data, error } = await authClient.scim.generateToken({ providerId, organizationId });
    if (error) throw new Error(error.message ?? "Failed to generate the SCIM token");
    if (!data?.scimToken) throw new Error("Invalid response from server");
    return data.scimToken;
  },
});

const $setSsoEnforcement = api.settings.organization["sso-enforcement"].$post;

export const setSsoEnforcementMutationOptions = mutationOptions({
  mutationKey: ["settings", "sso", "enforcement"] as const,
  mutationFn: async (enforced: boolean) => {
    const res = await $setSsoEnforcement({ json: { enforced } });
    if (!res.ok) await throwApiError(res, "Failed to update SSO enforcement");
    return (await res.json()) as InferResponseType<typeof $setSsoEnforcement, 200>;
  },
});
