import { Option } from "@packages/ddd-kit";

export interface EnforcedProvider {
  readonly providerId: string;
  readonly organizationId: string;
}

export type EnforcementLookup = (domain: string) => Promise<EnforcedProvider | null>;

export function domainOf(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const domain = parts[1]?.trim().toLowerCase();
  return domain?.includes(".") ? domain : null;
}

export async function isSsoEnforcedFor(
  email: string,
  lookup: EnforcementLookup,
): Promise<Option<EnforcedProvider>> {
  const domain = domainOf(email);
  if (!domain) return Option.none();
  return Option.fromNullable(await lookup(domain));
}
