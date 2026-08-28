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
    const providers = (data?.providers ?? []) as SsoProviderSummary[];
    // The endpoint returns no `createdAt` (or any other insertion-order field) to
    // sort by, and `findMany` on the server carries no `orderBy` — without a stable
    // sort here, "the org's provider" below would resolve to a different row across
    // reloads/refetches whenever an org has more than one. `providerId` is the only
    // field guaranteed present and stable.
    return [...providers].sort((a, b) => a.providerId.localeCompare(b.providerId));
  },
  staleTime: 30 * 1000,
});

/**
 * The single provider this org's cards act on. Deliberately "first after a stable
 * sort", not "the right one for a migration" — an org with two providers is a real
 * but unsupported case here (see provider-card.tsx), not something this picks
 * correctly for. All four sso cards must resolve the org's provider through this
 * helper rather than each re-filtering the list, so they can never disagree.
 */
export function primaryProviderFor(
  providers: SsoProviderSummary[] | undefined,
  organizationId: string | undefined,
): SsoProviderSummary | undefined {
  return providers?.find((p) => p.organizationId === organizationId);
}

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
