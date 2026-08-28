import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../../shared/auth/auth-client";

export interface SsoProviderSummary {
  providerId: string;
  type: string;
  issuer: string;
  domain: string;
  organizationId: string | null;
  domainVerified: boolean;
  spMetadataUrl: string;
}

export const ssoProvidersQueryOptions = queryOptions({
  queryKey: ["settings", "sso", "list"] as const,
  queryFn: async () => {
    const { data, error } = await authClient.sso.providers();
    if (error) throw new Error(error.message ?? "Failed to load SSO providers");
    return (data?.providers ?? []) as SsoProviderSummary[];
  },
  staleTime: 30 * 1000,
});

export const domainVerificationTokenQueryOptions = (providerId: string) =>
  queryOptions({
    queryKey: ["settings", "sso", "detail", providerId, "domain-verification-token"] as const,
    // `requestDomainVerification` is safe to call repeatedly while the domain is
    // unverified: the plugin returns the same active token instead of rotating it
    // (only mints a new one once the previous grant expires or is consumed).
    queryFn: async () => {
      const { data, error } = await authClient.sso.requestDomainVerification({ providerId });
      if (error) throw new Error(error.message ?? "Failed to load the verification token");
      return data?.domainVerificationToken ?? null;
    },
  });
